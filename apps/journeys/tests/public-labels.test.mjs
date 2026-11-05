import test from 'node:test';
import assert from 'node:assert/strict';
let subject = {};
try { subject = await import('../lib/seo/public-labels.ts'); } catch {}

const locales = ['en', 'zh-HK', 'zh-tw', 'zh-cn', 'ja', 'ko', 'th'];

test('public labels expose complete localized copy for every supported locale', () => {
  assert.equal(typeof subject.publicLabels, 'function');
  for (const locale of locales) {
    const labels = subject.publicLabels(locale);
    assert.ok(labels, locale);
    for (const value of [
      labels.common.unavailable,
      labels.common.retry,
      labels.common.previous,
      labels.common.next,
      labels.destinations.eyebrow,
      labels.destinations.title,
      labels.destinations.body,
      labels.destinations.empty,
      labels.destinations.guidesHeading,
      labels.destinations.emptyGuides,
      labels.destinations.experiencesHeading,
      labels.destinations.emptyExperiences,
      labels.destinations.articlesHeading,
      labels.destinations.emptyArticles,
      labels.destinations.sessionsHeading,
      labels.destinations.emptySessions,
      labels.experiences.hostedBy,
      labels.experiences.priceLabel,
      labels.merchants.websiteLabel,
      labels.merchants.experiencesHeading,
      labels.merchants.experiencesEmpty,
      labels.sessions.eyebrow,
      labels.sessions.title,
      labels.sessions.body,
      labels.sessions.upcomingHeading,
      labels.sessions.emptyUpcoming,
      labels.sessions.replaysHeading,
      labels.sessions.emptyReplays,
      labels.creators.guidesHeading,
      labels.creators.guidesEmpty,
      labels.guides.sourceHeading,
      labels.guides.author,
    ]) {
      assert.equal(typeof value, 'string', locale);
      assert.ok(value.trim(), locale);
    }
    assert.equal(typeof labels.destinations.guideCount(2), 'string');
    assert.equal(typeof labels.destinations.experienceCount(2), 'string');
    assert.equal(typeof labels.destinations.metadataDescription('Tokyo'), 'string');
  }
});

test('public labels preserve pinned wording and do not silently use English', () => {
  assert.equal(subject.publicLabels('en').destinations.eyebrow, 'Destinations');
  assert.equal(subject.publicLabels('zh-HK').destinations.eyebrow, '目的地');
  assert.equal(subject.publicLabels('zh-tw').destinations.eyebrow, '目的地');
  assert.equal(subject.publicLabels('zh-cn').destinations.eyebrow, '目的地');
  assert.equal(subject.publicLabels('ja').destinations.eyebrow, '旅行先');
  assert.equal(subject.publicLabels('ko').destinations.eyebrow, '여행지');
  assert.equal(subject.publicLabels('th').destinations.eyebrow, 'จุดหมาย');
  for (const locale of locales.slice(1)) {
    assert.notEqual(
      subject.publicLabels(locale).destinations.title,
      subject.publicLabels('en').destinations.title,
      locale,
    );
  }
  assert.equal(subject.publicLabels('zh-hk').destinations.eyebrow, '目的地');
  assert.equal(subject.publicLabels('fr'), null);
});
