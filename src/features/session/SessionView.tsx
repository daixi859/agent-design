/** Session 视图：详情加载 + Session Bar branched 徽标推送 + Transcript */
import { useContext, useEffect } from "react";
import { useParams } from "react-router";
import { SessionBadgeSetter } from "../../state/session-badge";
import { useSessionDetail } from "../../state/useSessionDetail";
import { Icon } from "../../ui/Icon";
import { Transcript } from "../transcript/Transcript";
import styles from "../transcript/transcript.module.css";

export function SessionView() {
  const { id } = useParams<{ id: string }>();
  const setSessionBadge = useContext(SessionBadgeSetter);
  const data = useSessionDetail(id);

  useEffect(() => {
    setSessionBadge({ branched: data.branch.abandonedCount > 0 });
  }, [setSessionBadge, data.branch.abandonedCount]);

  if (!id) return null;

  if (data.error) {
    return (
      <div className={styles.emptyState}>
        <Icon name="warning" size={28} />
        <strong>Couldn't load this session</strong>
        <span>{data.error}</span>
      </div>
    );
  }

  if (data.loading && !data.header) {
    return (
      <div className={styles.emptyState}>
        <Icon name="sparkles" size={28} />
        <span>Loading session…</span>
      </div>
    );
  }

  return (
    <Transcript
      projectPath={data.header?.cwd}
      branch={data.branch.entries}
      stats={data.stats}
      model={data.model}
      thinkingLevel={data.thinkingLevel}
    />
  );
}
