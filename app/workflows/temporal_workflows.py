"""Temporal workflow — the locked intelligence mission as durable execution.
Deterministic orchestration only; failed stages surface honestly as INCOMPLETE
missions (§12: never fabricate)."""
from __future__ import annotations

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError

_RETRY = RetryPolicy(initial_interval=timedelta(seconds=3), maximum_attempts=3)
_OPTS = {"start_to_close_timeout": timedelta(minutes=6), "retry_policy": _RETRY}


@workflow.defn(name="MissionWorkflow")
class MissionWorkflow:
    @workflow.run
    async def run(self, mission_id: str) -> str:
        try:
            await workflow.execute_activity("signal.plan", mission_id, **_OPTS)
            await workflow.execute_activity("signal.research", mission_id, **_OPTS)
            await workflow.execute_activity("signal.verify", mission_id, **_OPTS)
            await workflow.execute_activity("signal.knowledge", mission_id, **_OPTS)
            await workflow.execute_activity("signal.synthesize", mission_id, **_OPTS)
            return await workflow.execute_activity("signal.complete", mission_id, **_OPTS)
        except ActivityError as err:
            return await workflow.execute_activity(
                "signal.incomplete",
                args=[mission_id, f"Durable stage failed after retries: {err.__cause__ or err}"],
                **_OPTS,
            )
