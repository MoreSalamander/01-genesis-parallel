"""World-model graph — Neo4j (preserved-stack responsibility).

DataHub remains the metadata/context/provenance substrate; Neo4j owns
application-level relationship traversal over the §4 vocabulary
(Entity ←ABOUT– Claim ←GENERATED– Mission), answering multi-hop questions
like "what connects these companies across missions?"
"""
from __future__ import annotations

from app.config import Settings


class WorldGraph:
    def __init__(self, settings: Settings):
        self._driver = None
        if settings.force_mock:
            return
        try:
            from neo4j import GraphDatabase

            self._driver = GraphDatabase.driver(
                settings.neo4j_uri, auth=(settings.neo4j_user, settings.neo4j_password),
                connection_timeout=5,
            )
            self._driver.verify_connectivity()
            print(f"[graph] Neo4j connected: {settings.neo4j_uri}")
        except Exception as err:
            print(f"[graph] Neo4j unreachable ({err}) — DEGRADED: no world-graph mirror")
            self._driver = None

    @property
    def available(self) -> bool:
        return self._driver is not None

    def mirror_mission(self, mission) -> int:
        if self._driver is None:
            return 0
        edges = 0
        with self._driver.session() as session:
            session.run(
                "MERGE (m:Mission {id: $id}) SET m.objective = $objective, m.status = $status",
                id=mission.id, objective=mission.objective, status=mission.status.value,
            )
            for claim in mission.claims:
                if not claim.entity or claim.status.value == "UNVERIFIED":
                    continue
                session.run(
                    """
                    MERGE (e:Entity {name: $entity})
                    MERGE (c:Claim {id: $cid})
                      SET c.text = $text, c.status = $status, c.sources = $sources
                    MERGE (c)-[:ABOUT]->(e)
                    WITH c
                    MATCH (m:Mission {id: $mid})
                    MERGE (m)-[:GENERATED]->(c)
                    """,
                    entity=claim.entity, cid=claim.id, text=claim.text[:500],
                    status=claim.status.value, sources=claim.corroborating_sources,
                    mid=mission.id,
                )
                edges += 1
        return edges

    def neighborhood(self, entity: str, limit: int = 25) -> list[dict]:
        if self._driver is None:
            return []
        with self._driver.session() as session:
            result = session.run(
                """
                MATCH (e:Entity {name: $name})<-[:ABOUT]-(c:Claim)<-[:GENERATED]-(m:Mission)
                RETURN c.text AS claim, c.status AS status, m.id AS mission_id, m.objective AS objective
                LIMIT $limit
                """,
                name=entity, limit=limit,
            )
            return [dict(record) for record in result]

    def entities(self, limit: int = 50) -> list[dict]:
        if self._driver is None:
            return []
        with self._driver.session() as session:
            result = session.run(
                """
                MATCH (e:Entity)<-[:ABOUT]-(c:Claim)
                RETURN e.name AS name, count(c) AS claims
                ORDER BY claims DESC LIMIT $limit
                """,
                limit=limit,
            )
            return [dict(record) for record in result]
