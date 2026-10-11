/* ===== Campaigns: several campaigns side by side, each with its own characters ===== */
'use strict';

/* waits for pending saves before switching campaigns */
async function waitSaves() {
  for (let i = 0; i < 40 && (pending || Object.keys(timers).some(k => k.startsWith('save:'))); i++) await new Promise(r => setTimeout(r, 100));
}
const fmtDate = ms => ms ? new Date(ms).toLocaleString(LANG === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
async function renderCampaigns(main) {
  main.innerHTML = `<div class="empty">${t('Loading…')}</div>`;
  let d; try { d = await api('GET', '/api/campaigns'); } catch (e) { main.innerHTML = `<div class="empty">${t('Server unreachable.')}</div>`; return; }
  main.innerHTML = `<div class="camp-head row"><h2 style="margin:0"><i class="ico i-campaigns"></i> ${t('Campaigns')}</h2>
      <span class="muted small">${t('Each campaign has its own characters, maps, combats, journal and history. The bestiary and images are shared.')}</span>
      <button class="primary right" id="cp-new">+ ${t('New campaign')}</button></div>
    <div class="camp-grid">${d.list.map(c => `<div class="camp-card ${c.active ? 'active' : ''}" data-cp="${c.id}">
      <div class="camp-cover" style="${c.cover ? `background-image:url('${esc(c.cover)}')` : ''}" title="${t('Drop an image for the cover')}">${c.active ? `<span class="badge">▶ ${t('in progress')}</span>` : ''}</div>
      <div class="camp-body"><h3>${esc(c.name)}</h3><div class="muted small">${esc(c.desc || '')}</div>
        <div class="camp-pcs">${c.characters.map(p => `<div class="mini" title="${esc(p.name)} — ${t('lvl {n}', { n: p.niveau })} ${esc(classLabel(p.classe))}">${avatarHTML(p, 34)}<span>${esc(p.name)}</span></div>`).join('') || `<span class="muted small">${t('No characters.')}</span>`}</div>
        <div class="muted small"><i class="ico i-map"></i> ${t('{n} map(s)', { n: c.maps })} · <i class="ico i-scroll"></i> ${t('{n} note(s)', { n: c.notes })} · <i class="ico i-combat"></i> ${t('{n} encounter(s)', { n: c.encounters })} · ${t('last activity {date}', { date: fmtDate(c.last) })}</div>
        <div class="row" style="margin-top:8px">${c.active ? `<button disabled>✔ ${t('Active campaign')}</button>` : `<button class="primary" data-act="on">▶ ${t('Resume')}</button>`}
          <button class="small" data-act="edit" title="${t('Edit')}"><i class="ico i-quill"></i></button><button class="small" data-act="dup" title="${t('Duplicate')}">⧉</button>
          ${c.active ? '' : `<button class="small danger" data-act="del" title="${t('Move to the trash')}"><i class="ico i-trash"></i></button>`}</div></div></div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><h3><i class="ico i-save"></i> ${t('Automatic backups')}</h3>
      <p class="muted small">${t('An archive of the active campaign is created at startup, every 20 minutes if it changed and at each campaign switch (15 kept per campaign) in <code>{dir}</code>.', { dir: esc((S.dataDir || '') + '/backups') })}</p>
      <div class="row"><button id="cp-bk"><i class="ico i-save"></i> ${t('Back up now')}</button></div><div id="cp-bks" class="col small" style="margin-top:6px"></div></div>`;
  const bks = await api('GET', '/api/backups').catch(() => []);
  $('#cp-bks').innerHTML = bks.slice(0, 12).map(b => `<div class="row"><a href="/api/backups/${encodeURIComponent(b.file)}">${esc(b.file)}</a><span class="muted">${(b.size / 1024).toFixed(0)} ${t('KB')} · ${fmtDate(b.t)}</span></div>`).join('') || `<span class="muted">${t('None.')}</span>`;
  $('#cp-bk').onclick = async () => { await api('POST', '/api/backup', {}); toast(`<i class="ico i-save"></i> ${t('Backup created.')}`); rerender(); };
  $('#cp-new').onclick = () => newCampaignModal(d.list);
  $$('[data-cp]').forEach(card => {
    const id = card.dataset.cp, c = d.list.find(x => x.id === id);
    dropImage($('.camp-cover', card), async r => { await api('PUT', '/api/campaigns/' + id, { cover: r.url }); rerender(); }, { click: false });
    $$('[data-act]', card).forEach(b => b.onclick = async () => {
      const a = b.dataset.act;
      if (a === 'on') { await waitSaves(); await api('POST', `/api/campaigns/${id}/activate`, {}); location.reload(); }
      if (a === 'edit') ask(t('Edit the campaign'), [{ k: 'name', label: t('Name'), value: c.name }, { k: 'desc', label: t('Description'), type: 'textarea', value: c.desc }], async o => { await api('PUT', '/api/campaigns/' + id, o); if (c.active) { S.campMeta.name = o.name; $('#camp-name').textContent = o.name; } rerender(); });
      if (a === 'dup') { await api('POST', `/api/campaigns/${id}/duplicate`, {}); toast(t('Campaign duplicated.')); rerender(); }
      if (a === 'del') confirmBox(t('Move <b>{name}</b> to the trash?<br><span class="muted small">Nothing is erased: the folder is moved to data/trash/.</span>', { name: esc(c.name) }), async () => { await api('DELETE', '/api/campaigns/' + id); rerender(); });
    });
  });
}

async function newCampaignModal(list) {
  const sheets = await api('GET', '/api/scan').catch(() => []);
  modal(`<h3><i class="ico i-campaigns"></i> ${t('New campaign')}</h3><form class="col" id="nc-f">
    <label class="field"><span>${t('Name')}</span><input name="name" required placeholder="${t('The Lost Mine of Phandelver')}"></label>
    <label class="field"><span>${t('Description')}</span><textarea name="desc" rows="2" placeholder="${t('Pitch, party, game day…')}"></textarea></label>
    <b>${t('Characters')}</b>
    ${sheets.length ? `<div class="small muted">${t('From the text sheets of the <code>sheets/</code> folder:')}</div><div class="pick-grid">${sheets.map(s => `<label class="chk"><input type="checkbox" name="sheet" value="${esc(s.name)}"> ${esc(s.name)} <span class="muted small">${esc(classLabel(String(s.classe).split(/[—–]/)[0].trim()))} ${s.niveau}</span></label>`).join('')}</div>` : `<div class="muted small">${t('No text sheet in the sheets/ folder (you can create the characters afterwards).')}</div>`}
    ${list.filter(c => c.characters.length).map(c => `<div class="small muted">${t('Copy from "{name}":', { name: esc(c.name) })}</div><div class="pick-grid">${c.characters.map(p => `<label class="chk"><input type="checkbox" name="copy" value="${c.id}:${p.id}"> ${esc(p.name)} <span class="muted small">${t('lvl {n}', { n: p.niveau })}</span></label>`).join('')}</div>`).join('')}
    <label class="chk small"><input type="checkbox" name="reset" checked> ${t('restore copied characters to full health (HP, conditions)')}</label>
    <label class="chk"><input type="checkbox" name="activate" checked> ${t('start this campaign now')}</label>
    <div class="actions"><button type="button" data-close>${t('Cancel')}</button><button class="primary">${t('Create')}</button></div></form>`, (box, close) => {
    $('#nc-f', box).onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target), copies = fd.getAll('copy').map(v => v.split(':'));
      const from = copies[0]?.[0];
      if (copies.some(([c]) => c !== from)) return toast(t('Copy characters from one campaign at a time.'));
      const body = { name: fd.get('name'), desc: fd.get('desc'), sheets: fd.getAll('sheet'), resetChars: !!fd.get('reset'), activate: !!fd.get('activate'),
        copyFrom: from ? { campaign: from, chars: copies.map(x => x[1]) } : null };
      close();
      if (body.activate) await waitSaves();
      await api('POST', '/api/campaigns', body);
      if (body.activate) { store.set('gt-tab', 'characters'); location.reload(); } else rerender();
    };
  });
}
TABS.campaigns = { render: renderCampaigns };
