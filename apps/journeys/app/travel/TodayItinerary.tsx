'use client';

import {useEffect, useState} from 'react';
import type {TripSnapshot} from '../../lib/contracts/trips';
import type {TripDayLocations} from '../../lib/contracts/trip-locations';
import {clockLabel, dayDate, navigationUrl, orderedStops, selectTripDay} from '../../lib/trips/today';
import {request} from '../../lib/trips/repository';
import {invalidateAccountViews} from '../../lib/trips/local-drafts';
import {useApp} from './ui';
import {dayProgress} from '../../lib/trips/progress';
import {useTripProgress, ProgressSummary, ProgressActions} from './TripProgress';

type LocationsState = {
  key: string;
  status: 'loading' | 'ready' | 'error';
  data: TripDayLocations | null;
};

export function TodayItinerary({trip, actorId}: {trip: TripSnapshot; actorId: string}) {
  const {t} = useApp();
  const [now, setNow] = useState(() => Date.now());
  const [manualDay, setManualDay] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [locations, setLocations] = useState<LocationsState | null>(null);
  const selected = selectTripDay(trip, new Date(now), manualDay);
  const day = selected.day;
  const progress = useTripProgress(trip, actorId);
  const progressView = day && progress.ready ? dayProgress(day, progress.snapshot!.entries) : null;
  const key = `${actorId}:${trip.id}:${trip.revision}:${day?.id ?? ''}`;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!day || !day.stops.some(stop => stop.placeId)) return;
    let active = true;
    const controller = new AbortController();
    setLocations({key, status: 'loading', data: null});
    void request<TripDayLocations>(
      '/api/trips/' + encodeURIComponent(trip.id) + '/locations?day=' + encodeURIComponent(day.id),
      'GET', undefined, controller.signal, actorId,
    ).then(result => {
      if (!active) return;
      if (!result.ok) {
        if (result.code === 'AUTH_REQUIRED') invalidateAccountViews(null);
        setLocations({key, status: 'error', data: null});
        return;
      }
      const data = result.data;
      if (!data || data.tripId !== trip.id || data.dayId !== day.id ||
          data.revision !== trip.revision || !Array.isArray(data.places)) {
        setLocations({key, status: 'error', data: null});
        return;
      }
      setLocations({key, status: 'ready', data});
    });
    return () => {active = false; controller.abort()};
  }, [actorId, trip.id, trip.revision, day?.id, key, retry]);
  const current = locations?.key === key ? locations : null;
  const places = new Map(current?.data?.places.map(place => [place.placeId, place]));
  return <section id="today" className="k-panel" aria-label={t("Today's itinerary", '今日行程')}>
    <h2>{t("Today's itinerary", '今日行程')}</h2>
    <p>{selected.today ?? t('Date unavailable', '未能確認日期')} · {trip.timezone}</p>
    <label>{t('Day to read', '閱讀日期')}
      <select aria-label={t('Day to read', '閱讀日期')} value={day?.id ?? ''} onChange={event => setManualDay(event.target.value || null)}>
        <option value="">{t('Choose a day', '選擇一天')}</option>
        {[...trip.days].sort((a, b) => a.offset - b.offset).map(value =>
          <option key={value.id} value={value.id}>
            {dayDate(trip.startDate, value.offset) ?? `${t('Day', '第')} ${value.offset + 1}`} · {value.title}
          </option>)}
      </select>
    </label>
    <ProgressSummary day={day} model={progress}/>
    {!day ? <p>{selected.reason === 'undated'
      ? t('Dates are not set. Choose a day to read.', '未設定日期，請選擇一天閱讀。')
      : selected.reason === 'invalid'
        ? t('The trip date could not be determined. Reload the saved trip.', '未能確認行程日期，請重新載入已保存行程。')
        : t('Nothing is scheduled for today. Choose another day.', '今日未有安排，請選擇其他日期。')}</p>
      : <>
        <h3>{day.title}</h3>
        {!day.stops.length && <p>{t('There are no stops on this day.', '這一天未有站點。')}</p>}
        {current?.status === 'error' && <p role="status">
          {t('Location details could not be loaded. Reload the saved trip if it changed.', '未能載入地點資料；如行程已有變更，請重新載入已保存行程。')}
          <button className="k-btn" onClick={() => setRetry(value => value + 1)}>{t('Retry locations', '重試地點資料')}</button>
        </p>}
        <ol>
          {orderedStops(day).map(stop => {
            const place = stop.placeId ? places.get(stop.placeId) : null;
            const navigation = place ? navigationUrl(place) : null;
            const clock = clockLabel(stop.startMinuteOfDay);
            return <li key={stop.id} id={'progress-stop-' + stop.id} data-stop-id={stop.id}
              aria-current={progressView?.nextStopId === stop.id ? 'step' : undefined}
              style={progressView?.nextStopId === stop.id ? {borderInlineStart: '3px solid currentColor', paddingInlineStart: 12} : undefined}>
              {progressView?.nextStopId === stop.id && <p className="k-eyebrow">{t('Next stop', '下一站')}</p>}
              <h4>{stop.title}</h4>
              <p>{clock ? <time dateTime={clock}>{clock}</time> : t('Time not set', '未設定時間')}
                {stop.durationMinutes !== null && ` · ${stop.durationMinutes} ${t('min', '分鐘')}`}</p>
              {place?.address && <p>{place.address}</p>}
              {navigation ? <a className="k-btn" href={navigation} target="_blank"
                rel="noopener noreferrer" referrerPolicy="no-referrer">{t('Open navigation', '開啟導航')}</a>
                : <p>{stop.placeId && (!current || current.status === 'loading')
                  ? t('Loading location…', '正在載入地點…')
                  : current?.status === 'error' && stop.placeId
                    ? t('Location not loaded', '地點尚未載入')
                    : t('Location unavailable', '地點資料未能提供')}</p>}
              <ProgressActions stop={stop} model={progress}/>
            </li>;
          })}
        </ol>
      </>}
  </section>;
}
