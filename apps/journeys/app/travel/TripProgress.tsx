'use client';

import {useEffect, useRef, useState} from 'react';
import type {TripDay, TripSnapshot, TripStop} from '../../lib/contracts/trips';
import type {ProgressAck, ProgressIntent, ProgressSnapshot, ProgressState} from '../../lib/contracts/trip-progress';
import {acceptProgress, dayProgress, makeProgressIntent, readProgressAck, readProgressSnapshot} from '../../lib/trips/progress';
import {request} from '../../lib/trips/repository';
import {invalidateAccountViews, subscribeAccountInvalidation} from '../../lib/trips/local-drafts';
import {useApp} from './ui';

type Message = 'loading' | 'saving' | 'saved' | 'replayed' | 'unconfirmed' | 'conflict' | 'read_error' | 'removed' | 'account' | 'loaded';
type Session = {snapshot: ProgressSnapshot | null; pending: ProgressIntent | null; busy: boolean;
  valid: boolean; epoch: number; controller: AbortController | null};
type View = Pick<Session, 'snapshot' | 'pending' | 'busy' | 'valid'> & {message: Message};

export function useTripProgress(trip: TripSnapshot, actorId: string) {
  const session = useRef<Session>({snapshot: null, pending: null, busy: false, valid: true, epoch: 0, controller: null});
  const [view, setView] = useState<View>({snapshot: null, pending: null, busy: false, valid: true, message: 'loading'});
  const publish = (message: Message) => {
    const current = session.current;
    setView({snapshot: current.snapshot, pending: current.pending, busy: current.busy, valid: current.valid, message});
  };
  async function load(discard = false) {
    const current = session.current;
    if (!current.valid || current.busy) return;
    const epoch = current.epoch, pending = current.pending;
    current.busy = true; current.controller = new AbortController(); publish('loading');
    let message: Message = 'read_error';
    try {
      const result = await request<ProgressSnapshot>('/api/trips/' + encodeURIComponent(trip.id) + '/progress',
        'GET', undefined, current.controller.signal, actorId);
      if (epoch !== current.epoch || !current.valid) return;
      if (!result.ok) {
        if (result.code === 'AUTH_REQUIRED') {invalidateAccountViews(null); return}
        if (result.code === 'NOT_FOUND') {current.snapshot = null; message = 'removed'}
        return;
      }
      const next = readProgressSnapshot(result.data, actorId, trip.id);
      if (!next) return;
      current.snapshot = acceptProgress(current.snapshot, next);
      if (discard && current.pending?.requestId === pending?.requestId) current.pending = null;
      message = current.pending ? 'unconfirmed' : 'loaded';
    } finally {
      if (epoch === current.epoch) {current.busy = false; publish(message)}
    }
  }
  async function send(intent: ProgressIntent) {
    const current = session.current;
    if (!current.valid || current.busy) return;
    const epoch = current.epoch;
    current.pending = intent; current.busy = true; current.controller = new AbortController(); publish('saving');
    let message: Message = 'unconfirmed';
    try {
      const result = await request<ProgressAck>('/api/trips/' + encodeURIComponent(trip.id) + '/progress',
        'POST', intent, current.controller.signal, actorId);
      if (epoch !== current.epoch || !current.valid) return;
      if (!result.ok) {
        if (result.code === 'AUTH_REQUIRED') {invalidateAccountViews(null); return}
        if (result.code === 'CONFLICT') message = 'conflict';
        if (result.code === 'NOT_FOUND') {message = 'removed'; current.snapshot = null}
        return;
      }
      const ack = readProgressAck(result.data, intent, actorId, trip.id);
      if (!ack) return;
      current.snapshot = acceptProgress(current.snapshot, ack.snapshot);
      if (current.pending?.requestId === intent.requestId) current.pending = null;
      message = ack.replayed ? 'replayed' : 'saved';
    } finally {
      if (epoch === current.epoch) {current.busy = false; publish(message)}
    }
  }
  function change(stopId: string, desired: ProgressState) {
    const current = session.current;
    if (!current.snapshot || current.pending || current.busy || !current.valid) return;
    try {void send(makeProgressIntent(trip, current.snapshot, stopId, desired, crypto.randomUUID()))}
    catch {publish('conflict')}
  }
  useEffect(() => {
    const current = session.current;
    current.epoch++; current.controller?.abort(); current.snapshot = null; current.pending = null;
    current.busy = false; current.valid = true; publish('loading');
    const unsubscribe = subscribeAccountInvalidation(owner => {
      if (owner === actorId) return;
      current.epoch++; current.controller?.abort(); current.snapshot = null; current.pending = null;
      current.busy = false; current.valid = false; publish('account');
    });
    return () => {current.epoch++; current.controller?.abort(); unsubscribe()};
  }, [actorId, trip.id]);
  useEffect(() => {void load()}, [actorId, trip.id, trip.revision]);
  return {...view, ready: view.valid && !!view.snapshot && view.snapshot.tripRevision === trip.revision,
    change, load: () => void load(), discard: () => void load(true),
    retry: () => {if (session.current.pending) void send(session.current.pending)}};
}

export type ProgressModel = ReturnType<typeof useTripProgress>;
export function ProgressSummary({day, model}: {day: TripDay | null; model: ProgressModel}) {
  const {t} = useApp();
  const progress = day && model.ready ? dayProgress(day, model.snapshot!.entries) : null;
  const total = day ? dayProgress(day, []).total : 0;
  const copy: Record<Message, string> = {
    loading: t('Loading saved progress…', '正在載入已保存進度…'),
    saving: t('Saving progress…', '正在保存進度…'),
    saved: t('Progress saved.', '進度已保存。'),
    replayed: t('Original update confirmed. Showing current progress.', '原操作已確認，現正顯示最新進度。'),
    unconfirmed: t('Progress save is not confirmed. Keep this page open and retry the original update.', '未能確認進度保存，請保持此頁開啟並重試原操作。'),
    conflict: t('Progress changed in another tab. Your original update is kept; load latest progress before deciding.', '進度已在其他分頁改變，原操作已保留；請先載入最新進度再決定。'),
    read_error: t('Progress could not be loaded. Previously confirmed progress is kept.', '未能載入進度；較早已確認的進度仍然保留。'),
    removed: t('This stop or trip is no longer available. No replacement was created.', '此站點或行程已不存在，沒有建立替代進度。'),
    account: t('Account changed. Sign in again to load progress.', '帳戶已變更，請重新登入以載入進度。'),
    loaded: t('Current confirmed progress.', '目前已確認進度。'),
  };
  const mismatch = !!model.snapshot && !model.ready && model.valid;
  return <section aria-label={t('Trip progress', '行程進度')}>
    <h3>{t('Trip progress', '行程進度')}</h3>
    <p><strong>{progress ? progress.completed : model.ready ? 0 : '—'} / {total}</strong>
      {progress && ` · ${progress.visited} ${t('visited', '已到訪')} · ${progress.skipped} ${t('skipped', '已略過')}`}</p>
    <p role="status" aria-live="polite">{mismatch
      ? t('The saved itinerary changed. Load the current trip before marking progress.', '已保存行程有變更，請載入目前行程後再標記進度。')
      : copy[model.message]}</p>
    {progress?.complete && <p><strong>{t('Day complete — all stops visited or skipped.', '這一天已完成，所有站點均已到訪或略過。')}</strong></p>}
    {progress?.nextStopId && <p>{t('Next stop', '下一站')}: <a href={'#progress-stop-' + progress.nextStopId}>
      {day!.stops.find(stop => stop.id === progress.nextStopId)?.title}</a></p>}
    <button type="button" className="k-btn" disabled={model.busy || !model.valid} onClick={model.load}>
      {t('Load latest progress', '載入最新進度')}</button>
    {model.pending && <>
      <button type="button" className="k-btn" disabled={model.busy || !model.valid} onClick={model.retry}>
        {t('Retry original progress update', '重試原進度操作')}</button>
      <button type="button" className="k-btn" disabled={model.busy || !model.valid} onClick={model.discard}>
        {t('Dismiss pending update and use latest progress', '放棄待確認操作並使用最新進度')}</button>
    </>}
  </section>;
}

export function ProgressActions({stop, model}: {stop: TripStop; model: ProgressModel}) {
  const {t} = useApp();
  const state = model.snapshot?.entries.find(entry => entry.stopId === stop.id)?.state ?? 'pending';
  const disabled = !model.ready || model.busy || !!model.pending;
  return <div role="group" aria-label={t('Progress for ', '站點進度：') + stop.title}>
    <button type="button" className="k-btn" disabled={disabled || state === 'visited'}
      onClick={() => model.change(stop.id, 'visited')}>{t('Visited', '已到訪')}</button>
    <button type="button" className="k-btn" disabled={disabled || state === 'skipped'}
      onClick={() => model.change(stop.id, 'skipped')}>{t('Skip', '略過')}</button>
    {model.ready && state !== 'pending' && <button type="button" className="k-btn" disabled={disabled}
      onClick={() => model.change(stop.id, 'pending')}>{t('Undo', '撤銷')}</button>}
  </div>;
}
