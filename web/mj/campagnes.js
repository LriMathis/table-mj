/* ===== Campagnes : plusieurs campagnes en parallèle, chacune avec ses personnages ===== */
'use strict';

/* attend la fin des enregistrements en cours avant de changer de campagne */
async function waitSaves() {
  for (let i = 0; i < 40 && (pending || Object.keys(timers).some(k => k.startsWith('save:'))); i++) await new Promise(r => setTimeout(r, 100));
}
async function renderCampagnes(main) {
  main.innerHTML = '<div class="empty">Chargement…</div>';
  let d; try { d = await api('GET', '/api/campagnes'); } catch (e) { main.innerHTML = '<div class="empty">Serveur injoignable.</div>'; return; }
  const when = t => t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  main.innerHTML = `<div class="camp-head row"><h2 style="margin:0"><i class="ico i-campagnes"></i> Campagnes</h2>
      <span class="muted small">Chaque campagne a ses propres personnages, cartes, combats, journal et historique. Le bestiaire et les images sont communs.</span>
      <button class="primary right" id="cp-new">+ Nouvelle campagne</button></div>
    <div class="camp-grid">${d.list.map(c => `<div class="camp-card ${c.active ? 'active' : ''}" data-cp="${c.id}">
      <div class="camp-cover" style="${c.cover ? `background-image:url('${esc(c.cover)}')` : ''}" title="Glissez une image pour la couverture">${c.active ? '<span class="badge">▶ en cours</span>' : ''}</div>
      <div class="camp-body"><h3>${esc(c.name)}</h3><div class="muted small">${esc(c.desc || '')}</div>
        <div class="camp-pcs">${c.characters.map(p => `<div class="mini" title="${esc(p.name)} — niv. ${p.niveau} ${esc(p.classe)}">${avatarHTML(p, 34)}<span>${esc(p.name)}</span></div>`).join('') || '<span class="muted small">Aucun personnage</span>'}</div>
        <div class="muted small"><i class="ico i-carte"></i> ${c.maps} carte(s) · <i class="ico i-parchemin"></i> ${c.notes} note(s) · <i class="ico i-combat"></i> ${c.encounters} rencontre(s) · dernière activité ${when(c.last)}</div>
        <div class="row" style="margin-top:8px">${c.active ? '<button disabled>✔ Campagne active</button>' : `<button class="primary" data-act="on">▶ Reprendre</button>`}
          <button class="small" data-act="edit"><i class="ico i-plume"></i></button><button class="small" data-act="dup" title="Dupliquer">⧉</button>
          ${c.active ? '' : '<button class="small danger" data-act="del" title="Mettre à la corbeille"><i class="ico i-poubelle"></i></button>'}</div></div></div>`).join('')}</div>
    <div class="card" style="margin-top:14px"><h3><i class="ico i-sauver"></i> Sauvegardes automatiques</h3>
      <p class="muted small">Une archive de la campagne active est créée au démarrage, toutes les 20 minutes si elle a changé et à chaque changement de campagne (15 gardées par campagne) dans <code>${esc(S.dataDir || '')}/sauvegardes-auto</code>.</p>
      <div class="row"><button id="cp-bk"><i class="ico i-sauver"></i> Sauvegarder maintenant</button></div><div id="cp-bks" class="col small" style="margin-top:6px"></div></div>`;
  const bks = await api('GET', '/api/sauvegardes').catch(() => []);
  $('#cp-bks').innerHTML = bks.slice(0, 12).map(b => `<div class="row"><a href="/api/sauvegardes/${encodeURIComponent(b.file)}">${esc(b.file)}</a><span class="muted">${(b.size / 1024).toFixed(0)} Ko · ${when(b.t)}</span></div>`).join('') || '<span class="muted">Aucune.</span>';
  $('#cp-bk').onclick = async () => { await api('POST', '/api/sauvegarde', {}); toast('<i class="ico i-sauver"></i> Sauvegarde créée.'); rerender(); };
  $('#cp-new').onclick = () => newCampaignModal(d.list);
  $$('[data-cp]').forEach(card => {
    const id = card.dataset.cp, c = d.list.find(x => x.id === id);
    dropImage($('.camp-cover', card), async r => { await api('PUT', '/api/campagnes/' + id, { cover: r.url }); rerender(); }, { click: false });
    $$('[data-act]', card).forEach(b => b.onclick = async () => {
      const a = b.dataset.act;
      if (a === 'on') { await waitSaves(); await api('POST', `/api/campagnes/${id}/activer`, {}); location.reload(); }
      if (a === 'edit') ask('Modifier la campagne', [{ k: 'name', label: 'Nom', value: c.name }, { k: 'desc', label: 'Description', type: 'textarea', value: c.desc }], async o => { await api('PUT', '/api/campagnes/' + id, o); if (c.active) { S.campMeta.name = o.name; $('#camp-name').textContent = o.name; } rerender(); });
      if (a === 'dup') { await api('POST', `/api/campagnes/${id}/dupliquer`, {}); toast('Campagne dupliquée.'); rerender(); }
      if (a === 'del') confirmBox(`Mettre <b>${esc(c.name)}</b> à la corbeille ?<br><span class="muted small">Rien n'est effacé : le dossier est déplacé dans donnees/corbeille/.</span>`, async () => { await api('DELETE', '/api/campagnes/' + id); rerender(); });
    });
  });
}

async function newCampaignModal(list) {
  const sheets = await api('GET', '/api/scan').catch(() => []);
  modal(`<h3><i class="ico i-campagnes"></i> Nouvelle campagne</h3><form class="col" id="nc-f">
    <label class="field"><span>Nom</span><input name="name" required placeholder="Les Mines de Phancreux"></label>
    <label class="field"><span>Description</span><textarea name="desc" rows="2" placeholder="Pitch, groupe, jour de jeu…"></textarea></label>
    <b>Personnages</b>
    ${sheets.length ? `<div class="small muted">Depuis les fiches texte du dossier <code>fiches/</code> :</div><div class="pick-grid">${sheets.map(s => `<label class="chk"><input type="checkbox" name="sheet" value="${esc(s.name)}"> ${esc(s.name)} <span class="muted small">${esc(String(s.classe).split(/[—–]/)[0])} ${s.niveau}</span></label>`).join('')}</div>` : '<div class="muted small">Aucune fiche texte dans le dossier fiches/ (vous pourrez créer les personnages ensuite).</div>'}
    ${list.filter(c => c.characters.length).map(c => `<div class="small muted">Copier depuis « ${esc(c.name)} » :</div><div class="pick-grid">${c.characters.map(p => `<label class="chk"><input type="checkbox" name="copy" value="${c.id}:${p.id}"> ${esc(p.name)} <span class="muted small">niv. ${p.niveau}</span></label>`).join('')}</div>`).join('')}
    <label class="chk small"><input type="checkbox" name="reset" checked> remettre les personnages copiés en pleine forme (PV, états)</label>
    <label class="chk"><input type="checkbox" name="activate" checked> commencer cette campagne maintenant</label>
    <div class="actions"><button type="button" data-close>Annuler</button><button class="primary">Créer</button></div></form>`, (box, close) => {
    $('#nc-f', box).onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target), copies = fd.getAll('copy').map(v => v.split(':'));
      const from = copies[0]?.[0];
      if (copies.some(([c]) => c !== from)) return toast('Copiez les personnages depuis une seule campagne à la fois.');
      const body = { name: fd.get('name'), desc: fd.get('desc'), sheets: fd.getAll('sheet'), resetChars: !!fd.get('reset'), activate: !!fd.get('activate'),
        copyFrom: from ? { campagne: from, chars: copies.map(x => x[1]) } : null };
      close();
      if (body.activate) await waitSaves();
      await api('POST', '/api/campagnes', body);
      if (body.activate) { try { localStorage.setItem('mj-tab', 'persos'); } catch (_) { } location.reload(); } else rerender();
    };
  });
}
TABS.campagnes = { render: renderCampagnes };
