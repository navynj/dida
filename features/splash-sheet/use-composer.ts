'use client';

import { useState } from 'react';

import { annotationVerdict, type Annotation } from '@/features/input-sheet/draft';
import { discardingOnRefusal, useMediaAttach } from '@/features/input-sheet/media-field';
import { placeCard, type Card, ownPoolColumn } from '@/features/home/grid';
import { createJointSplash, dropOwnPoolSplash, placeNewSplash } from '@/features/pool/actions';
import type { AudiencePick } from '@/features/pool/audience';
import { NO_SHARE, type ShareDraft } from '@/features/pool/share-draft';
import type { PoolScope } from '@/features/pool/compose-scope';
import { poolSplashHref } from '@/features/pool/pool-cards';
import type { PoolPick } from '@/features/pool/pool-lane-picker';
import type { Together } from '@/features/pool/pool-pick';
import { dropSplash, setSplashDescription } from '@/features/splash/actions';
import { defaultBlockDay, isRange } from '@/features/splash/block-day';
import { summarizeSplash } from '@/features/splash/summary';
import type { IsoDate } from '@/lib/time';
import { usePeople } from '@/features/people/people-provider';
import type { MediaMeta } from '@/lib/ripple-media';

import { composeDrop } from './split-title';
import type { DropHandoff, SheetContext } from './splash-composer';

/**
 * Everything a draft holds, as a value: the sheet starts from a fresh one;
 * the draft card hands it up on Save and, refused, is opened again from it
 * with its fields intact (H80).
 */
export type ComposerSnapshot = {
  titleText: string;
  icon: string;
  bodyText: string;
  describing: boolean;
  description: string;
  laneId: string | null;
  pick: PoolPick;
  together: Together;
  share: ShareDraft;
  annotation: Annotation | null;
  chosenDay: IsoDate | null;
  mediaPaths: string[];
  previews: Record<string, string>;
  meta: MediaMeta;
};

type CommitResult = { ok: true } | { ok: false; message: string; landed?: true };

/**
 * The composer's state and its handoff (SPEC 6, H21, H75, H80), apart from
 * any frame: the post sheet and the draft card on the stack hold the same
 * fields and hand over the same drop.
 */
export function useComposer({
  context,
  pool = null,
  initial = null,
}: {
  context: SheetContext;
  pool?: PoolScope | null;
  /** A refused draft, opened again as it was (H80). */
  initial?: ComposerSnapshot | null;
}) {
  const { categories, timeZone, today, initials } = context;
  const { me } = usePeople();
  const fresh = (): Annotation => ({ date: today, time: null, endDate: null, endTime: null });
  const [titleText, setTitleText] = useState(initial?.titleText ?? '');
  // The post's own icon (0008); empty lets the lane's emoji stand for it.
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [bodyText, setBodyText] = useState(initial?.bodyText ?? '');
  // The splash's description (0037), asked for from the top line's `…`.
  const [describing, setDescribing] = useState(initial?.describing ?? false);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [laneId, setLaneId] = useState<string | null>(initial?.laneId ?? null);
  // From a pool: a pool lane, and Together (0033).
  const [pick, setPick] = useState<PoolPick>(initial?.pick ?? null);
  // Everyone starts on exactly as the pool's switch says, nothing hidden
  // over it: a pool of one included (H61).
  const noOne = (): Together => ({
    everyone: Boolean(pool?.inviteAllByDefault),
    picked: [],
  });
  const [together, setTogether] = useState<Together>(initial?.together ?? noOne);
  // Where it is shared from Home, each pool's lane auto or picked by hand (H75).
  const [share, setShare] = useState<ShareDraft>(initial?.share ?? NO_SHARE);
  const joint = pick?.kind === 'joint';
  // My pool record (0033): mine, on the pool lane, with no lane of mine.
  const own = pick?.kind === 'own';
  // From a pool there is no audience to choose: what is written there is in
  // that pool, and only there. From Home, Only me until set (H45).
  const audience: AudiencePick[] = pool ? [] : share.picks;
  // A pool or joint record shows in the pool's column on my Home until I
  // file it (H45).
  const poolLane = pool && pick ? pool.lanes.find((l) => l.id === pick.poolLaneId) : undefined;
  // Filled with Everyone on, or once anyone is picked (0033).
  const invitesOthers = together.everyone || together.picked.length > 0;
  // Today is in the field from the start (review): the post's date, days
  // only (H24). Removed with its ×, the post rests on today all the same.
  const [annotation, setAnnotation] = useState<Annotation | null>(
    initial ? initial.annotation : fresh,
  );
  // The first block's own day, when the post's date is a range (0031).
  const [chosenDay, setChosenDay] = useState<IsoDate | null>(initial?.chosenDay ?? null);
  const draftRange =
    annotation?.endDate && annotation.endDate > annotation.date
      ? { start: annotation.date, end: annotation.endDate }
      : null;
  const firstDay = isRange(draftRange)
    ? chosenDay && chosenDay >= draftRange.start && chosenDay <= draftRange.end
      ? chosenDay
      : defaultBlockDay(draftRange, today)
    : null;
  const [mediaPaths, setMediaPaths] = useState<string[]>(initial?.mediaPaths ?? []);
  const media = useMediaAttach(mediaPaths, setMediaPaths, initial);

  const { title, body } = composeDrop(titleText, bodyText);
  const hasContent =
    title.length > 0 || body.length > 0 || mediaPaths.length > 0 || laneId !== null;
  // Anything a person would lose by discarding it (H80): words, a photo, a
  // lane, an icon, a description, or a pool picked.
  const touched =
    hasContent ||
    icon.length > 0 ||
    description.trim().length > 0 ||
    pick !== null ||
    share.picks.length > 0;
  // From a pool a pool lane must be chosen, or the record would not land there.
  const poolReady =
    !pool ||
    (joint
      ? title.length > 0 || body.length > 0
      : own
        ? title.length > 0 || body.length > 0 || mediaPaths.length > 0
        : false);
  const annotationOk = !annotation || annotationVerdict(annotation) === 'ok';
  const canCommit = hasContent && annotationOk && poolReady;

  function snapshot(): ComposerSnapshot {
    return {
      titleText,
      icon,
      bodyText,
      describing,
      description,
      laneId,
      pick,
      together,
      share,
      annotation,
      chosenDay,
      mediaPaths,
      previews: media.previews,
      meta: media.meta,
    };
  }

  function reset(): void {
    setTitleText('');
    setIcon('');
    setBodyText('');
    setDescribing(false);
    setDescription('');
    setLaneId(null);
    setPick(null);
    setTogether(noOne());
    setShare(NO_SHARE);
    setAnnotation(fresh());
    setChosenDay(null);
    setMediaPaths([]);
  }

  /**
   * The drop as the ground should show it, and the action that makes it
   * real, under `id` — minted in the browser, so the mark is the real one
   * from the start. `keepOnRefusal`: a refusal leaves the photos uploaded,
   * for a draft that is opened again with them (H80); else a refusal
   * removes them, the draft being gone.
   */
  function handoff(id: string, { keepOnRefusal = false } = {}): DropHandoff {
    const a = annotation;
    const now = new Date();
    const hasBlock = body.length > 0 || mediaPaths.length > 0;
    // The post's range (H24): the chip's days, else today.
    const declaredStart = a?.date ?? today;
    const declaredEnd = a?.endDate && a.endDate !== a.date ? a.endDate : null;
    // The first block's day, inside the range only (0031).
    const blockDay = hasBlock && firstDay ? firstDay : null;
    const input = {
      id,
      title,
      body,
      media: mediaPaths,
      mediaMeta: media.meta,
      declaredStart,
      declaredEnd,
      declaredLaneId: laneId,
      icon: icon || null,
      today,
      sessionId: null,
      blockDay,
    };

    // The post as the ground should show it, summarised the way the page
    // summarises a real one.
    const splash = summarizeSplash(
      {
        id,
        owner_id: '',
        title,
        declared_start: declaredStart,
        declared_end: declaredEnd,
        declared_lane_id: laneId,
        icon: icon || null,
        session_id: null,
        pinned_at: null,
        pool_id: null,
        pool_lane_id: null,
        own_pool_id: own && pool ? pool.poolId : null,
        created_by: null,
        joint_invite_all: false,
        is_welcome: false,
        description: describing && description.trim() ? description.trim() : null,
        type: 'free',
        prompt: null,
        ends_at: null,
        created_at: now.toISOString(),
        // Mine, written now: today in my zone, as the trigger will store it.
        written_on: today,
      },
      hasBlock
        ? [
            {
              id: `${id}-first`,
              note: body.length > 0 ? body : null,
              occurred_on: blockDay,
              occurred_time: null,
              created_at: now.toISOString(),
            },
          ]
        : [],
      timeZone,
      now,
    );

    // Handed over with the drop: whoever commits it owns the photos now.
    const uploaded = media.keep(mediaPaths);
    const shared = audience;
    // The card this pool seats before the server has it (H23).
    const poolCard: Card | null =
      pool && poolLane && (joint || own)
        ? {
            ...placeCard(splash, body, timeZone),
            column: poolLane.id,
            lane: { icon: poolLane.icon, name: poolLane.name },
            href: poolSplashHref(pool.poolId, id),
            ...(joint
              ? {
                  joint: true,
                  together: invitesOthers,
                  branches: body
                    ? [
                        {
                          id: `${id}-first`,
                          column: poolLane.id,
                          initials,
                          authorId: me ?? undefined,
                        },
                      ]
                    : [],
                }
              : { author: initials, authorId: me ?? undefined }),
          }
        : null;

    // Home seats it where the server will (review, H45): in the pool's
    // column with the pool lane's emoji.
    const poolColumn = pool
      ? {
          id: ownPoolColumn(pool.poolId),
          name: pool.poolName,
          icon: null,
          monogram: pool.poolName,
          href: null,
        }
      : null;
    const fallback = poolLane ? { icon: poolLane.icon, name: pool!.poolName } : null;
    const home =
      pool && poolColumn && (joint || own)
        ? {
            card: {
              ...(joint
                ? {
                    column: poolColumn.id,
                    joint: true,
                    together: invitesOthers,
                    pools: [pool.poolName],
                    href: poolSplashHref(pool.poolId, id),
                    menu: { pin: false, delete: false },
                    editable: true,
                  }
                : { column: poolColumn.id }),
              ...(fallback ? { lane: fallback } : {}),
            },
            column: poolColumn,
          }
        : undefined;

    // Written after the splash itself, by the same action the page uses: any
    // drop path, mine or joint (RLS holds who may). Past the splash, a
    // failure says it landed, so a draft is not opened again over it.
    const described = describing ? description.trim() : '';
    const withDescription =
      (made: () => Promise<CommitResult>) => async (): Promise<CommitResult> => {
        const done = await made();
        if (!done.ok || !described) return done;
        const saved = await setSplashDescription(id, described);
        return saved.ok
          ? saved
          : {
              ok: false,
              message: `Dropped, but the description was not saved: ${saved.message}`,
              landed: true,
            };
      };

    const made = withDescription(
      own
        ? () =>
            dropOwnPoolSplash({
              id,
              poolId: pool!.poolId,
              poolLaneId: pick.poolLaneId,
              title,
              icon: icon || null,
              body,
              media: mediaPaths,
              mediaMeta: media.meta,
              declaredStart,
              declaredEnd,
              blockDay,
            })
        : joint
          ? () =>
              createJointSplash({
                id,
                poolId: pool!.poolId,
                poolLaneId: pick.poolLaneId,
                title,
                icon: icon || null,
                body,
                media: mediaPaths,
                mediaMeta: media.meta,
                declaredStart,
                declaredEnd,
                blockDay,
                invitees: together.everyone ? [] : together.picked,
                everyone: together.everyone,
              })
          : async () => {
              const made = await dropSplash(input);
              if (!made.ok || shared.length === 0) return made;
              const placed = await placeNewSplash(id, shared);
              return placed.ok
                ? placed
                : {
                    ok: false,
                    message: `Dropped, but not shared: ${placed.message}`,
                    landed: true,
                  };
            },
    );

    return {
      splash,
      month: declaredStart.slice(0, 7),
      note: body.length > 0 ? body : null,
      ...(pool && poolCard ? { pool: { poolId: pool.poolId, card: poolCard } } : {}),
      ...(home ? { home } : {}),
      commit: keepOnRefusal ? made : discardingOnRefusal(made, uploaded),
    };
  }

  return {
    pool,
    categories,
    titleText,
    setTitleText,
    icon,
    setIcon,
    bodyText,
    setBodyText,
    describing,
    setDescribing,
    description,
    setDescription,
    laneId,
    setLaneId,
    pick,
    setPick,
    together,
    setTogether,
    share,
    setShare,
    audience,
    annotation,
    setAnnotation,
    draftRange,
    firstDay,
    setChosenDay,
    mediaPaths,
    media,
    touched,
    canCommit,
    snapshot,
    reset,
    handoff,
  };
}

export type Composer = ReturnType<typeof useComposer>;
