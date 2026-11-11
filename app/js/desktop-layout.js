// Desktop presentation only. Screen logic and original mobile node order stay intact.
export function mountDesktopLayout(root) {
  const wide = window.matchMedia('(min-width: 1100px)');
  let original = [], stage = null, sidebar = null, frame = 0, stopped = false;
  const header = document.querySelector('.topbar');
  const dock = document.querySelector('.tabbar');
  const gameScreens = new Set(['play', 'analysis', 'online']);
  const observer = new MutationObserver(schedule);
  const sizes = new ResizeObserver(schedule);

  function observe() { if (!stopped) observer.observe(root, { childList: true }); }
  function restore() {
    observer.disconnect(); sizes.disconnect();
    if (stage?.parentElement === root) root.replaceChildren(...original);
    root.classList.remove('desktop-layout');
    for (const property of ['--desktop-board-size', '--desktop-stage-width', '--desktop-side-width', '--desktop-panel-height']) root.style.removeProperty(property);
    stage = sidebar = null; original = [];
    observe();
  }
  function arrange() {
    frame = 0;
    if (stopped) return;
    if (!wide.matches || !gameScreens.has(root.dataset.screen)) { restore(); return; }
    if (stage?.parentElement !== root) {
      observer.disconnect(); sizes.disconnect();
      original = [...root.children];
      if (!original.some(el => el.classList.contains('board-wrap'))) { observe(); return; }
      stage = document.createElement('section'); stage.className = 'desktop-stage'; stage.setAttribute('aria-label', 'Доска и игроки');
      sidebar = document.createElement('aside'); sidebar.className = 'desktop-sidebar'; sidebar.setAttribute('aria-label', 'Ходы и управление партией');
      const screen = root.dataset.screen;
      const panelTitle = document.createElement('h2'); panelTitle.className = 'desktop-panel-heading';
      panelTitle.textContent = screen === 'analysis' ? 'Разбор партии' : 'История ходов';
      sidebar.append(panelTitle);
      const isStage = el => el.classList.contains('board-wrap') || (screen === 'play' && el.classList.contains('player')) || (screen === 'analysis' && el.classList.contains('nav')) || (screen === 'online' && (el.classList.contains('online-status') || el.classList.contains('row')));
      // In review, history is visible first; long coaching notes scroll within the side panel.
      const sideNodes = original.filter(el => !isStage(el));
      if (screen === 'analysis') sideNodes.sort((a, b) => Number(b.classList.contains('moves-strip')) - Number(a.classList.contains('moves-strip')));
      original.filter(isStage).forEach(el => stage.append(el));
      sideNodes.forEach(el => sidebar.append(el));
      root.append(stage, sidebar); root.classList.add('desktop-layout');
      sizes.observe(root); if (header) sizes.observe(header);
      for (const child of stage.children) if (!child.classList.contains('board-wrap')) sizes.observe(child);
      observe();
    }
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const dockReserve = (dock?.getBoundingClientRect().height || 58) + 24;
    const availableHeight = Math.max(160, viewportHeight - Math.max(root.getBoundingClientRect().top, header?.getBoundingClientRect().bottom || 0) - dockReserve - 14);
    const sideWidth = Math.min(360, Math.max(300, root.clientWidth * .29));
    const availableWidth = root.clientWidth - 40 - sideWidth - 24;
    const nonBoard = [...stage.children].filter(el => !el.classList.contains('board-wrap'));
    const extraHeight = nonBoard.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0) + nonBoard.length * 8;
    const evalWidth = root.dataset.screen === 'analysis' ? 18 : 0;
    const board = Math.floor(Math.max(120, Math.min(820, availableWidth - evalWidth, availableHeight - extraHeight)));
    const set = (name, value) => { const px = value + 'px'; if (root.style.getPropertyValue(name) !== px) root.style.setProperty(name, px); };
    set('--desktop-side-width', sideWidth); set('--desktop-board-size', board); set('--desktop-stage-width', board + evalWidth); set('--desktop-panel-height', Math.floor(availableHeight));
  }
  function schedule() { if (!stopped && !frame) frame = requestAnimationFrame(arrange); }
  wide.addEventListener('change', schedule);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  observe(); schedule();
  return { destroy() {
    stopped = true; cancelAnimationFrame(frame); observer.disconnect(); sizes.disconnect();
    wide.removeEventListener('change', schedule); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule);
    restore();
  } };
}
