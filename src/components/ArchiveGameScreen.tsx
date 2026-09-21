import React, { useState } from 'react';
import { AppShell } from './AppShell';
import { applyGoalTag } from '../utils/goalTags';
import { gameSummary } from '../utils/gameHighlights';
import { nextPullOverride, pullingTeamForPoint } from '../utils/possession';
import { shareSummaryImage } from '../utils/scoreShareImage';
import type { ArchivedGame, ArchivedPoint } from '../utils/gameArchive';

function playerName(game: ArchivedGame, id: string | undefined): string {
  if (!id) return '';
  return game.roster.find((player) => player.uuid === id)?.name ?? 'Player';
}

function withPoint(game: ArchivedGame, pointNumber: number, patch: Partial<ArchivedPoint>): ArchivedGame {
  return {
    ...game,
    points: game.points.map((point) => {
      if (point.pointNumber !== pointNumber) return point;
      const next = { ...point, ...patch };
      if (!next.scorerId) delete next.scorerId;
      if (!next.throwerId) delete next.throwerId;
      if (!next.pullOverride) delete next.pullOverride;
      return next;
    }),
  };
}

function pointDetail(game: ArchivedGame, point: ArchivedPoint): string {
  if (point.team !== 1) return '';
  const scorer = playerName(game, point.scorerId);
  const thrower = playerName(game, point.throwerId);
  if (scorer && thrower) return `${scorer} · ${thrower}`;
  if (scorer) return scorer;
  return 'Add scorer';
}

export function ArchiveGameScreen({
  game,
  onBack,
  onChange,
}: {
  game: ArchivedGame;
  onBack: () => void;
  onChange: (game: ArchivedGame) => void;
}) {
  const [openPoint, setOpenPoint] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const summary = gameSummary(game);
  const ourPoints = game.points.filter((point) => point.team === 1);
  const tagged = ourPoints.some((point) => point.scorerId);

  const tagPoint = (point: ArchivedPoint, playerId: string) => {
    const nextTag = applyGoalTag(
      { scorerId: point.scorerId, throwerId: point.throwerId },
      playerId
    );
    onChange(
      withPoint(game, point.pointNumber, {
        scorerId: nextTag.scorerId,
        throwerId: nextTag.throwerId,
      })
    );
  };

  const flipPull = (point: ArchivedPoint) => {
    if (game.openingPull == null) return;
    onChange(
      withPoint(game, point.pointNumber, {
        pullOverride: nextPullOverride(point.pointNumber, game.openingPull, game.points),
      })
    );
  };

  const share = () => {
    if (sharing) return;
    setSharing(true);
    void shareSummaryImage({
      team1Name: game.team1Name,
      team2Name: game.team2Name,
      team1Score: game.team1Score,
      team2Score: game.team2Score,
      lines: summary.lines,
    }).finally(() => setSharing(false));
  };

  return (
    <AppShell
      title={`${game.team1Name} vs ${game.team2Name}`}
      width="narrow"
      left={
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
      }
    >
      <div className="summary-score">
        <div>
          <div className="summary-team">{game.team1Name}</div>
          <div className="summary-num">{game.team1Score}</div>
        </div>
        <div>
          <div className="summary-team">{game.team2Name}</div>
          <div className="summary-num">{game.team2Score}</div>
        </div>
      </div>

      {(summary.record || summary.scorer || summary.thrower) && (
        <div className="summary-stats">
          {summary.record && (
            <>
              <div className="summary-stat">
                <div className="summary-stat-value">{summary.record.breaks}</div>
                <div className="summary-stat-label">Breaks</div>
              </div>
              <div className="summary-stat">
                <div className="summary-stat-value">{summary.record.holds}</div>
                <div className="summary-stat-label">Holds</div>
              </div>
            </>
          )}
          {summary.scorer && (
            <div className="summary-stat summary-stat--name">
              <div className="summary-stat-value">{summary.scorer.names[0]}</div>
              <div className="summary-stat-label">
                {summary.scorer.names.length > 1 ? 'Tied for goals' : `Scored ${summary.scorer.count}`}
              </div>
            </div>
          )}
          {summary.thrower && (
            <div className="summary-stat summary-stat--name">
              <div className="summary-stat-value">{summary.thrower.names[0]}</div>
              <div className="summary-stat-label">
                {summary.thrower.names.length > 1 ? 'Tied for throws' : `Threw ${summary.thrower.count}`}
              </div>
            </div>
          )}
        </div>
      )}

      <button type="button" className="btn btn-primary summary-share-wide" onClick={share} disabled={sharing}>
        {sharing ? 'Sharing…' : 'Share summary'}
      </button>
      {!tagged && ourPoints.length > 0 && (
        <p className="summary-note">Tag a point to add who scored. The share card picks it up.</p>
      )}

      <h2 className="summary-points-title">Points</h2>
      <ol className="summary-points">
        {game.points.map((point) => {
          const open = openPoint === point.pointNumber;
          const pull =
            game.openingPull == null
              ? null
              : pullingTeamForPoint(point.pointNumber, game.openingPull, game.points);
          const names =
            point.team === 1
              ? point.linePlayerIds
                  .map((id) => game.roster.find((player) => player.uuid === id))
                  .filter((player): player is ArchivedGame['roster'][number] => player != null)
              : [];
          const detail = pointDetail(game, point);
          return (
            <li key={point.pointNumber} className={`summary-point${open ? ' is-open' : ''}`}>
              <button
                type="button"
                className="summary-point-row"
                aria-expanded={open}
                onClick={() => setOpenPoint(open ? null : point.pointNumber)}
              >
                <span>Point {point.pointNumber}</span>
                <span className="summary-point-who">
                  {point.team === 1 ? game.team1Name : game.team2Name}
                </span>
                {detail && <span className="summary-point-detail">{detail}</span>}
              </button>
              {open && (
                <div className="summary-point-edit">
                  {pull != null && (
                    <button type="button" className="btn btn-ghost summary-pull" onClick={() => flipPull(point)}>
                      {pull === 1 ? 'We pulled' : 'They pulled'}
                    </button>
                  )}
                  {names.length > 0 && (
                    <>
                      <p className="summary-edit-hint">Tap scorer, then thrower.</p>
                      <div className="goal-tag-names">
                        {names.map((player) => {
                          const role =
                            player.uuid === point.scorerId
                              ? 'Score'
                              : player.uuid === point.throwerId
                                ? 'Throw'
                                : null;
                          return (
                            <button
                              key={player.uuid}
                              type="button"
                              className={`goal-tag-name${role ? ' is-tagged' : ''}`}
                              onClick={() => tagPoint(point, player.uuid)}
                            >
                              <span>{player.name}</span>
                              {role && <span className="goal-tag-role">{role}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </AppShell>
  );
}
