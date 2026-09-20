/* verify-delta.js — Lucius STEP 3 gate: computed-style verification of a rendered c4-delta.html.
   Usage: node verify-delta.js <html-path> <newN> <modN> <relNewN> <magentaId> [amberId] [clickId] [remFrom remTo]
   Asserts delta hues resolve through the CSS cascade (not just class presence), the click
   highlight wins the cascade, and arrows render identical to the normal view (no delta hue). */
const path = require('path');
const { chromium } = require('C:/Users/Merlin/Documents/repos/Black_Owned/node_modules/playwright');

const [, , html, newN, modN, relNewN, magentaId, amberId, clickId, remFrom, remTo] = process.argv;
const URL = 'file:///' + path.resolve(html).replace(/\\/g, '/');
const MAGENTA = 'rgb(217, 70, 239)';
const AMBER = 'rgb(251, 191, 36)';
const WHITE = 'rgb(255, 255, 255)';
const REL_DEFAULT = 'rgb(71, 85, 105)';
const CLICK = clickId || magentaId;

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(URL);
  await page.waitForSelector('.tab-btn');

  const counts = await page.evaluate(() => ({
    new: document.querySelectorAll('#delta g.element.delta-new').length,
    mod: document.querySelectorAll('#delta g.element.delta-modified').length,
    rem: document.querySelectorAll('#delta g.element.delta-removed').length,
    relNew: document.querySelectorAll('#delta g.relationship.delta-new').length,
  }));
  check(`counts_${newN}new_${modN}mod_${relNewN}relnew`,
    counts.new === +newN && counts.mod === +modN && counts.rem === 0 && counts.relNew === +relNewN,
    JSON.stringify(counts));

  await page.click('.tab-btn[data-target="delta"]');
  await page.waitForSelector('#delta.panel.active');

  const strokeOf = (id) => page.evaluate((eid) => {
    const g = document.querySelector(`#delta g.element[data-id="${eid}"]`);
    if (!g) return null;
    const r = g.querySelector('rect');
    const cs = getComputedStyle(r);
    return { cls: g.getAttribute('class'), stroke: cs.stroke, width: cs.strokeWidth };
  }, id);

  const mc = await strokeOf(magentaId);
  check('new_box_computed_magenta', mc && mc.stroke === MAGENTA && mc.width === '3px', JSON.stringify(mc));
  if (amberId) {
    const ac = await strokeOf(amberId);
    check('modified_box_computed_amber',
      ac && ac.cls.includes('delta-modified') && ac.stroke === AMBER, JSON.stringify(ac));
  }
  if (remFrom) {
    const gone = await page.evaluate(([f, t]) =>
      !document.querySelector(`#c3 g.relationship[data-from="${f}"][data-to="${t}"]`), [remFrom, remTo]);
    check('removed_edge_gone', gone, `edge ${remFrom}->${remTo} still present`);
  }

  // click a delta box — selection highlight (!important white) must beat the delta stroke
  const sel = await page.evaluate((eid) => {
    const g = document.querySelector(`#delta g.element[data-id="${eid}"]`);
    if (!g) return null;
    g.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return new Promise((res) => setTimeout(() => {
      const r = g.querySelector('rect');
      res({ cls: g.getAttribute('class'), stroke: getComputedStyle(r).stroke });
    }, 150));
  }, CLICK);
  check('click_selection_white_wins_cascade', sel && /hl-selected/.test(sel.cls) && sel.stroke === WHITE, JSON.stringify(sel));

  const green = await page.evaluate(() => {
    const els = document.querySelectorAll('#delta .hl-feeder rect, #delta .hl-consumer rect');
    return [...els].map((r) => getComputedStyle(r).stroke).slice(0, 3);
  });
  check('click_feeder_green_info', green.every((s) => s === 'rgb(34, 197, 94)') && green.length >= 1, JSON.stringify(green));

  // arrow parity: relationship arrows carry no delta hue and match the c3 view default stroke
  const arrows = await page.evaluate(() => {
    const DELTA_HUES = ['rgb(217, 70, 239)', 'rgb(251, 191, 36)', 'rgb(239, 68, 68)'];
    const paths = [...document.querySelectorAll('#delta g.relationship path')];
    const colored = paths.filter((p) => DELTA_HUES.includes(getComputedStyle(p).stroke)).length;
    const c3 = document.querySelector('#c3 g.relationship path');
    return {
      total: paths.length,
      colored,
      deltaSample: paths.length ? getComputedStyle(paths[0]).stroke : null,
      c3Sample: c3 ? getComputedStyle(c3).stroke : null,
    };
  });
  check('arrows_no_delta_hue', arrows.colored === 0, JSON.stringify(arrows));
  check('arrow_parity_delta_vs_c3',
    arrows.deltaSample === arrows.c3Sample && arrows.deltaSample === REL_DEFAULT, JSON.stringify(arrows));

  const tab = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.tab-btn[data-target="delta"]')).color);
  check('delta_tab_hued', tab === MAGENTA, tab);

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  results.forEach((r) => console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ' — ' + r.detail : ''}`));
  console.log(fails.length ? `VERIFY FAIL ${fails.length}/${results.length}` : `VERIFY PASS ${results.length}/${results.length}`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT_ERROR', e.message); process.exit(2); });
