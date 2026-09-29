// Wynko static ad set — 30 creatives, all copy pulled from marketing.html.
// Each ad is an HTML frame rendered to PNG with Playwright.
//   node marketing/ads/build.mjs            -> renders every ad into marketing/ads/png/
//   node marketing/ads/build.mjs 07 12      -> renders only those ids

export const SIZES = {
  feed: { w: 1080, h: 1350, label: '4:5 feed' },
  square: { w: 1080, h: 1080, label: '1:1 square' },
  story: { w: 1080, h: 1920, label: '9:16 story/reel' },
};

const X = '<span class="x">✕</span>';
const OK = '<span class="ok">✓</span>';

export const ADS = [
  // ───────────────────────── 01 Hero
  {
    id: '01', slug: 'hero-focus-recall-together', size: 'feed',
    body: `
      <div class="center col gap-40" style="flex:1">
        <img src="{{A}}/wynko-mark.png" style="width:300px;filter:drop-shadow(0 30px 80px rgba(255,138,61,.35))">
        <h1 class="h1 tc" style="font-size:112px">Focus.<br>Recall.<br><em>Together.</em></h1>
        <p class="lead tc" style="max-width:820px">The complete study OS for JEE, NEET, CAT &amp; UPSC. Tracker, blocker and study crew in one app.</p>
        <div class="row gap-16">
          <div class="chip"><b>8</b> revision intervals</div>
          <div class="chip"><b>10+</b> exams</div>
          <div class="chip"><b>₹0</b> always</div>
        </div>
      </div>`,
    cta: 'Get started free',
  },

  // ───────────────────────── 02 Reels rigged
  {
    id: '02', slug: 'reels-game-is-rigged', size: 'feed',
    body: `
      <div class="eyebrow">// The bigger picture</div>
      <h1 class="h1" style="font-size:108px;margin-top:28px">The reels game is <em>rigged.</em></h1>
      <div class="slot">
        <div class="reel">▶</div><div class="reel">▶</div><div class="reel">▶</div>
        <div class="stamp">LOCKED</div>
      </div>
      <p class="lead">Shorts &amp; Reels run on the same variable-reward loop as slot machines. Every swipe whispers <i>"maybe the next one."</i></p>
      <h2 class="h2" style="margin-top:36px">We built the <em>counter.</em></h2>`,
    cta: 'Lock in free',
  },

  // ───────────────────────── 03 Focus Lock browser mock
  {
    id: '03', slug: 'focus-lock-toughest-blocker', size: 'feed',
    body: `
      <div class="eyebrow">01 — Focus Lock</div>
      <h1 class="h1" style="font-size:92px;margin-top:24px">The internet's toughest blocker. <em>No cap.</em></h1>
      <div class="browser" style="margin-top:56px">
        <div class="bar"><i></i><i></i><i></i><div class="url">🔒 youtube.com</div></div>
        <div class="bbody">
          <div class="row between"><div class="pill-or">● Session locked</div><div class="mono big">41:12 left</div></div>
          <div class="muted" style="margin:30px 0 18px">Only these channels are reachable right now</div>
          <div class="li">${OK} 3Blue1Brown</div>
          <div class="li">${OK} Khan Academy</div>
          <div class="li off">${X} Shorts feed</div>
          <div class="li off">${X} Recommended</div>
        </div>
      </div>`,
    cta: 'Try Focus Lock',
  },

  // ───────────────────────── 04 Escape attempts
  {
    id: '04', slug: 'nice-try-escape-attempts', size: 'square',
    body: `
      <div class="row between" style="align-items:flex-start">
        <h1 class="h1" style="font-size:112px">Nice<br><em>try.</em></h1>
        <svg width="150" height="180" viewBox="0 0 190 220"><defs><linearGradient id="lg4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA94D"/><stop offset="1" stop-color="#B43E16"/></linearGradient></defs><path d="M45 100 V65 a50 50 0 0 1 100 0 V100" fill="none" stroke="#CFC8BB" stroke-width="18" stroke-linecap="round"/><rect x="15" y="95" width="160" height="120" rx="26" fill="url(#lg4)"/><circle cx="95" cy="145" r="16" fill="#0B0B0D"/><rect x="88" y="150" width="14" height="36" rx="7" fill="#0B0B0D"/></svg>
      </div>
      <div class="col gap-16" style="margin-top:40px">
        <div class="strike"><span>Close the tab</span><b>blocked</b></div>
        <div class="strike"><span>Open incognito</span><b>blocked</b></div>
        <div class="strike"><span>Switch browsers</span><b>blocked</b></div>
        <div class="strike"><span>Force-quit / uninstall</span><b>blocked</b></div>
      </div>
      <p class="lead" style="margin-top:36px;font-size:30px">Focus Lock holds at the desktop-app level. Until the session ends, you're not getting out.</p>`,
    cta: 'Lock in',
  },

  // ───────────────────────── 05 Passphrase
  {
    id: '05', slug: 'type-your-way-out', size: 'feed',
    body: `
      <div class="eyebrow">Pause for a cause</div>
      <h1 class="h1" style="font-size:100px;margin-top:24px">Want out early?<br><em>Type</em> your way out.</h1>
      <div class="card" style="margin-top:56px">
        <div class="muted">Retype this code to unlock</div>
        <div class="code">q7Rv-mZ2k-Lp9x-Wt4n-aB8s-Hc3y-Ne6u-Xd1f-Kg5j-Yr0w-Ps2m-Tv7q…</div>
        <div class="typed">q7Rv-mZ2k-Lp9<span class="caret"></span></div>
        <div class="row between" style="margin-top:18px"><span class="muted">No copy. No paste.</span><span class="mono or">13 / 150</span></div>
      </div>
      <p class="lead" style="margin-top:44px">Early exit takes a long code, typed by hand. Not a tap. By the time you finish, the urge is gone.</p>`,
    cta: 'Try Focus Lock',
  },

  // ───────────────────────── 06 Forgetting curve
  {
    id: '06', slug: 'something-is-fading', size: 'feed',
    body: `
      <div class="eyebrow">Loss aversion</div>
      <h1 class="h1" style="font-size:96px;margin-top:24px">Something is <em>fading</em> right now.</h1>
      <div class="card" style="margin-top:50px;padding:40px 40px 28px">
        <svg viewBox="0 0 900 420" width="100%">
          <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#FF8A3D"/><stop offset="1" stop-color="#FFE59A"/></linearGradient></defs>
          <g stroke="#26262A" stroke-width="2"><line x1="40" y1="30" x2="40" y2="370"/><line x1="40" y1="370" x2="880" y2="370"/>
          <line x1="40" y1="200" x2="880" y2="200" stroke-dasharray="6 10"/></g>
          <path d="M40 40 C 90 250, 160 300, 300 322 S 650 350, 880 356" fill="none" stroke="#E07A6B" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 14"/>
          <path d="M40 40 C 70 130,90 150,120 160 L120 60 C 170 150,210 165,260 170 L260 60 C 330 130,380 145,450 150 L450 60 C 560 110,620 120,700 124 L700 60 C 780 90,840 96,880 98" fill="none" stroke="url(#g)" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
          <g fill="#7A756D" font-family="Sora" font-size="22"><text x="40" y="405">Today</text><text x="235" y="405">+1d</text><text x="425" y="405">+7d</text><text x="820" y="405">+30d</text></g>
        </svg>
        <div class="row gap-32" style="margin-top:10px">
          <div class="legend"><i style="background:#E07A6B"></i>Without revision</div>
          <div class="legend"><i style="background:#FF8A3D"></i>With Wynko</div>
        </div>
      </div>
      <p class="lead" style="margin-top:40px">What you haven't revised isn't paused. It's slipping away while you decide whether to open the app.</p>`,
    cta: 'Start revising free',
  },

  // ───────────────────────── 07 8 intervals
  {
    id: '07', slug: 'eight-intervals-zero-guesswork', size: 'feed',
    body: `
      <div class="eyebrow">Ebbinghaus tracker</div>
      <h1 class="h1" style="font-size:112px;margin-top:24px"><em>8</em> revision intervals.<br>Zero guesswork.</h1>
      <div class="timeline">
        ${['5m', '12h', '+1d', '+2d', '+4d', '+7d', '+15d', '+30d'].map((t, i) => `
          <div class="tstep"><div class="dot${i < 3 ? ' done' : i === 3 ? ' now' : ''}">${i < 3 ? '✓' : i + 1}</div><div class="tlabel">${t}</div></div>`).join('')}
      </div>
      <p class="lead">Enter your exam date. Wynko pre-plans every review for every topic. You just show up and tick the box.</p>`,
    cta: 'Build my calendar',
  },

  // ───────────────────────── 08 RevMGrid
  {
    id: '08', slug: 'study-like-someones-watching', size: 'feed',
    body: `
      <div class="eyebrow">02 — Live study rooms</div>
      <h1 class="h1" style="font-size:82px;margin-top:24px">Study like someone's watching. <em>Because they are.</em></h1>
      <div class="grid2" style="margin-top:44px">
        ${[['P', 'Priya', 'Physics', '1:42:10', true], ['A', 'Arjun', 'Bio', '58:31'], ['S', 'Sana', 'DND', '2:05:44'], ['R', 'Rohit', 'Maths', '1:12:09']].map(([i, n, s, t, sp]) => `
          <div class="tile${sp ? ' speaking' : ''}"><div class="av">${i}</div>
            <div class="tname">${n} · ${s}</div><div class="ttime mono">${t}</div></div>`).join('')}
      </div>
      <div class="streakbar">🔥 Group streak: 14 days straight</div>`,
    cta: 'Join a room',
  },

  // ───────────────────────── 09 Streak
  {
    id: '09', slug: 'fourteen-day-group-streak', size: 'square',
    body: `
      <div class="center col" style="flex:1">
        <div class="mega" style="font-size:300px">14</div>
        <div class="h2" style="margin-top:-6px">day group streak 🔥</div>
        <div class="dots">${Array.from({ length: 21 }, (_, i) => `<i class="${i < 14 ? 'on' : ''}"></i>`).join('')}</div>
        <p class="lead tc" style="max-width:800px">Nobody wants to be the one who breaks it. That's the point.</p>
      </div>`,
    cta: 'Start a streak',
  },

  // ───────────────────────── 10 Study partners (story)
  {
    id: '10', slug: 'find-a-study-partner', size: 'story',
    body: `
      <div class="eyebrow">03 — Study partners</div>
      <h1 class="h1" style="font-size:88px;margin-top:24px">Find someone who's <em>actually grinding</em> your syllabus.</h1>
      <div class="swipe">
        <div class="swipe-bg"></div>
        <div class="swipe-card">
          <div class="bigav">K</div>
          <div class="h2" style="font-size:56px;margin-top:30px">Kavya · NEET 2027</div>
          <div class="match">92% compatibility</div>
          <div class="row gap-12 wrap center" style="margin-top:30px">
            <div class="tag">Biology</div><div class="tag">Early riser</div><div class="tag">Silent study</div>
          </div>
          <div class="row center gap-40" style="margin-top:48px">
            <div class="btn-round">✕</div><div class="btn-round heart">♥</div>
          </div>
        </div>
      </div>
      <p class="lead">Match on exam track &amp; study habits. A partner who notices when you go quiet beats any streak counter.</p>`,
    cta: 'Find my partner',
  },

  // ───────────────────────── 11 Bounty
  {
    id: '11', slug: 'dare-your-group', size: 'feed',
    body: `
      <div class="eyebrow">Bounty challenges</div>
      <h1 class="h1" style="font-size:112px;margin-top:24px">Dare your group.<br><em>Play for coins.</em></h1>
      <div class="card" style="margin-top:50px">
        <div class="row between"><div class="h3">🏆 Physics Sprint</div><div class="pill-or">240 coins</div></div>
        <div class="muted" style="margin-top:8px">Ends tonight · most study hours wins</div>
        <div class="podium">
          <div class="pod p2"><div class="av sm">A</div><div class="bar">15%</div></div>
          <div class="pod p1"><div class="av sm or">P</div><div class="bar">80%</div></div>
          <div class="pod p3"><div class="av sm">S</div><div class="bar">5%</div></div>
        </div>
      </div>
      <p class="small" style="margin-top:28px">Coins, not cash. No gambling, just healthy competition with your crew.</p>`,
    cta: 'Start a challenge',
  },

  // ───────────────────────── 12 Wynkoins
  {
    id: '12', slug: 'study-more-earn-wynkoins', size: 'square',
    body: `
      <div class="row gap-40" style="flex:1;align-items:center">
        <div style="flex:1">
          <h1 class="h1" style="font-size:84px">Study more.<br><em class="alt">Earn Wynkoins.</em></h1>
          <p class="lead" style="margin-top:32px">Rack up coins as you study, then spend them on avatars &amp; cosmetics in the M² Store.</p>
        </div>
        <img src="{{A}}/wynkoin.png" style="width:360px;flex:none;filter:drop-shadow(0 30px 70px rgba(168,85,247,.45))">
      </div>`,
    cta: 'Start earning',
    glow: 'violet',
  },

  // ───────────────────────── 13 Exams
  {
    id: '13', slug: 'your-exam-your-track', size: 'feed',
    body: `
      <h1 class="h1" style="font-size:120px">Your exam.<br><em>Your track.</em></h1>
      <p class="lead" style="margin-top:24px">Enter your subjects. Wynko works out the exam for you.</p>
      <div class="exams">
        ${[['JEE', 'Physics · Chemistry · Maths'], ['NEET', 'Physics · Chemistry · Biology'], ['CAT', 'Quant · LR · VA · DI'], ['UPSC', 'GS1–GS4 · CSAT'], ['GATE', 'Core + Aptitude'], ['IAT', 'PCM + Biology'], ['NEST', 'PCM + Biology'], ['Custom', 'Any subject, any exam']].map(([e, s], i) => `
          <div class="ex${i === 0 ? ' hot' : ''}"><div class="exn">${e}</div><div class="exs">${s}</div></div>`).join('')}
      </div>`,
    cta: 'Pick my exam',
  },

  // ───────────────────────── 14 Free
  {
    id: '14', slug: 'zero-rupees-free-forever', size: 'square',
    body: `
      <div class="center col" style="flex:1">
        <div class="mega" style="font-size:380px">₹0</div>
        <div class="h2 tc">Free forever.</div>
        <div class="row gap-16" style="margin-top:36px">
          <div class="chip">No card</div><div class="chip">No trial</div><div class="chip">No catch</div>
        </div>
      </div>`,
    cta: 'Get Wynko',
  },

  // ───────────────────────── 15 Zeigarnik
  {
    id: '15', slug: 'unfinished-chapters-scream', size: 'feed',
    body: `
      <div class="eyebrow">Zeigarnik effect</div>
      <h1 class="h1" style="font-size:104px;margin-top:24px">Unfinished chapters <em>scream</em> in your head.</h1>
      <div class="card col gap-20" style="margin-top:56px">
        <div class="check done"><i>✓</i>Kinematics<span>done</span></div>
        <div class="check due"><i></i>Thermodynamics<span>due today</span></div>
        <div class="check due"><i></i>Chemical Equilibrium<span>due today</span></div>
        <div class="check"><i></i>Rotational Motion<span>+2d</span></div>
      </div>
      <p class="lead" style="margin-top:44px">Open loops stick in your head. Tick one off and the noise goes quiet.</p>`,
    cta: 'Close the loop',
  },

  // ───────────────────────── 16 Identity (story)
  {
    id: '16', slug: 'discipline-isnt-a-mood', size: 'story',
    body: `
      <div class="eyebrow">Identity, not intensity</div>
      <h1 class="h1" style="font-size:120px;margin-top:30px">Discipline isn't a <em>mood.</em></h1>
      <p class="lead" style="margin-top:40px;font-size:40px">Small daily actions, until "the person who studies every day" is just who you are.</p>
      <div class="cal">
        ${Array.from({ length: 35 }, (_, i) => `<i class="${i < 26 ? 'on' : i === 26 ? 'today' : ''}"></i>`).join('')}
      </div>
      <p class="small">The system runs. You stop negotiating with yourself every morning.</p>`,
    cta: 'Build the habit',
  },

  // ───────────────────────── 17 Exam date won't move
  {
    id: '17', slug: 'exam-date-wont-move', size: 'feed',
    body: `
      <div class="calpage">
        <div class="calhead">EXAM DAY</div>
        <div class="calday">D-<span>142</span></div>
      </div>
      <h1 class="h1" style="font-size:96px;margin-top:60px">The exam date won't move.<br><em>Neither should your system.</em></h1>
      <p class="lead" style="margin-top:32px">Every day you spend thinking about it, the forgetting curve wins by default. Set it up once.</p>`,
    cta: 'Lock in, it\'s free',
  },

  // ───────────────────────── 18 Ulysses
  {
    id: '18', slug: 'bind-yourself-to-the-mast', size: 'square',
    body: `
      <div class="eyebrow">Precommitment</div>
      <h1 class="h1" style="font-size:112px;margin-top:24px">Bind yourself<br>to the <em>mast.</em></h1>
      <div class="row gap-40" style="margin-top:44px;align-items:center">
        <svg width="190" height="220" viewBox="0 0 190 220"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFA94D"/><stop offset="1" stop-color="#B43E16"/></linearGradient></defs>
          <path d="M45 100 V65 a50 50 0 0 1 100 0 V100" fill="none" stroke="#CFC8BB" stroke-width="18" stroke-linecap="round"/>
          <rect x="15" y="95" width="160" height="120" rx="26" fill="url(#lg)"/><circle cx="95" cy="145" r="16" fill="#0B0B0D"/><rect x="88" y="150" width="14" height="36" rx="7" fill="#0B0B0D"/></svg>
        <p class="lead" style="flex:1">Decide once, while you're calm. When the urge hits, there's no decision left to make. Focus Lock holds the line.</p>
      </div>`,
    cta: 'Try Focus Lock',
  },

  // ───────────────────────── 19 Alone vs together
  {
    id: '19', slug: 'alone-you-drift', size: 'feed',
    body: `
      <h1 class="h1" style="font-size:108px">Alone, you <span class="dim">drift.</span><br>Together, you <em>lock in.</em></h1>
      <div class="row gap-24" style="margin-top:60px">
        <div class="solo"><div class="av">You</div><div class="muted" style="margin-top:20px">Phone in hand. 3rd reel.</div></div>
        <div class="crew">
          ${['P', 'A', 'S', 'R', 'K', 'You'].map((i, n) => `<div class="mini${n === 5 ? ' me' : ''}"><div class="av sm${n === 5 ? ' or' : ''}">${i}</div></div>`).join('')}
        </div>
      </div>
      <p class="lead" style="margin-top:48px">Psychology's oldest finding: in quiet company, people stay focused longer. RevMGrid puts your crew on camera, side by side.</p>`,
    cta: 'Join a room',
  },

  // ───────────────────────── 20 YouTube mode (story)
  {
    id: '20', slug: 'youtube-minus-the-rabbit-hole', size: 'story',
    body: `
      <div class="eyebrow">YouTube mode</div>
      <h1 class="h1" style="font-size:124px;margin-top:30px">YouTube,<br>minus the <em>rabbit hole.</em></h1>
      <div class="card col gap-24" style="margin-top:70px;padding:56px">
        <div class="yt">${OK}<span>3Blue1Brown</span><b>allowed</b></div>
        <div class="yt">${OK}<span>Khan Academy</span><b>allowed</b></div>
        <div class="yt">${OK}<span>Your teacher's channel</span><b>allowed</b></div>
        <div class="yt off">${X}<span>Shorts</span><b>gone</b></div>
        <div class="yt off">${X}<span>Recommended</span><b>gone</b></div>
      </div>
      <p class="lead" style="margin-top:56px;font-size:40px">Home feed and search stay open. Only the channels you whitelist show up.</p>`,
    cta: 'Set up YouTube mode',
  },

  // ───────────────────────── 21 Sleep Lock
  {
    id: '21', slug: 'sleep-lock', size: 'square',
    body: `
      <div class="row between" style="align-items:flex-start">
        <div>
          <div class="eyebrow">Sleep Lock</div>
          <h1 class="h1" style="font-size:104px;margin-top:24px">Your phone<br>goes to bed <em>too.</em></h1>
        </div>
        <div class="moon"></div>
      </div>
      <div class="card row between" style="margin-top:56px">
        <div><div class="muted">Tonight</div><div class="mono" style="font-size:64px;color:var(--ink)">11:30 PM → 6:00 AM</div></div>
      </div>
      <p class="lead" style="margin-top:36px;font-size:30px">Every site and app blocked overnight. Backing out takes a long, deliberate code, not a sleepy tap.</p>`,
    cta: 'Turn on Sleep Lock',
  },

  // ───────────────────────── 22 Telegram reminders
  {
    id: '22', slug: 'revision-reminders-telegram', size: 'feed',
    body: `
      <h1 class="h1" style="font-size:80px">A missed day never quietly turns into a <em>forgotten topic.</em></h1>
      <div class="phone">
        <div class="chat-head"><div class="av sm or">W</div><div><b>Wynko Bot</b><div class="muted" style="font-size:22px">bot</div></div></div>
        <div class="bubble">⏰ Revision due: <b>Thermodynamics</b> (+7d)<br>Takes about 12 min. Don't let it slip.</div>
        <div class="bubble">📚 3 more topics due today: Equilibrium, Rotational Motion, Ionic Bonding</div>
        <div class="bubble me">done ✅</div>
      </div>
      <p class="lead">Connect Telegram or email. Wynko nudges you the moment a revision is due.</p>`,
    cta: 'Connect reminders',
  },

  // ───────────────────────── 23 Smart schedules
  {
    id: '23', slug: 'snap-your-timetable', size: 'feed',
    body: `
      <div class="eyebrow">Smart schedules</div>
      <h1 class="h1" style="font-size:90px;margin-top:24px">Snap your timetable.<br><em>Wynko runs the day.</em></h1>
      <div class="row gap-24" style="margin-top:44px;align-items:center">
        <div class="paper">
          <div>6–8 Phy</div><div>8:30 Chem</div><div>11 Maths</div><div>2 PM Bio</div><div>5 mock</div>
        </div>
        <div class="arrow">→</div>
        <div class="col gap-12" style="flex:1">
          <div class="blk s">06:00 · Physics <span>Focus Lock</span></div>
          <div class="blk b">08:00 · Break</div>
          <div class="blk s">08:30 · Chemistry <span>Focus Lock</span></div>
          <div class="blk b">10:30 · Break</div>
          <div class="blk s">11:00 · Maths <span>Focus Lock</span></div>
        </div>
      </div>
      <p class="lead" style="margin-top:48px">Study, break, study. It starts and stops on its own. No need to hit start.</p>`,
    cta: 'Plan my day',
  },

  // ───────────────────────── 24 Memory strength
  {
    id: '24', slug: 'know-what-youre-about-to-forget', size: 'square',
    body: `
      <h1 class="h1" style="font-size:100px">Know what you're about to <em>forget.</em></h1>
      <div class="col gap-28" style="margin-top:56px">
        ${[['Rotational Motion', 34, 'due now'], ['Organic Chemistry', 61, '+2d'], ['Genetics', 78, '+4d'], ['Kinematics', 92, '+15d']].map(([t, v, d]) => `
          <div class="mem"><div class="row between"><span>${t}</span><span class="mono${v < 50 ? ' or' : ''}">${v}% · ${d}</span></div>
          <div class="track"><div class="fill${v < 50 ? ' low' : ''}" style="width:${v}%"></div></div></div>`).join('')}
      </div>`,
    cta: 'See my memory map',
  },

  // ───────────────────────── 25 One app instead of five
  {
    id: '25', slug: 'one-app-instead-of-five', size: 'feed',
    body: `
      <h1 class="h1" style="font-size:108px">Delete five apps.<br>Keep <em>one.</em></h1>
      <div class="table">
        ${[['Site blocker', 'Focus Lock'], ['Revision planner', 'Ebbinghaus tracker'], ['Study-with-me video', 'RevMGrid rooms'], ['Study buddy hunt', 'Partner matching'], ['Reminder app', 'Telegram nudges']].map(([a, b]) => `
          <div class="tr"><span class="gone">${a}</span><span class="arr">→</span><span class="ok">${b}</span></div>`).join('')}
      </div>
      <p class="small" style="margin-top:28px">All live in the app right now. No "coming soon."</p>`,
    cta: 'Get all of it free',
  },

  // ───────────────────────── 26 Founder story
  {
    id: '26', slug: 'built-by-a-student', size: 'feed',
    body: `
      <div class="quote-mark">“</div>
      <h1 class="h1" style="font-size:78px;font-weight:700;line-height:1.12">I'd sit for hours, finally feel like a topic had clicked, and a few days later it was <em>gone.</em> Not rusty. Gone.</h1>
      <div class="rule"></div>
      <p class="lead">So I built the fix: Ebbinghaus's forgetting curve, turned into a tracker that schedules every revision for you.</p>
      <div class="row gap-20" style="margin-top:44px;align-items:center">
        <img src="{{A}}/wynko-mark.png" style="width:84px">
        <div><b style="font-size:30px;color:var(--ink)">Built by a student, for students</b><div class="muted">Free for everyone, from metros to tier-3 towns</div></div>
      </div>`,
    cta: 'Read our story',
  },

  // ───────────────────────── 27 11:47 PM (story)
  {
    id: '27', slug: 'just-one-more-reel', size: 'story',
    body: `
      <div class="clock mono">11:47 PM</div>
      <h1 class="h1" style="font-size:140px;margin-top:40px">"Just one more reel."</h1>
      <div class="notif">
        <div class="row gap-16" style="align-items:center"><img src="{{A}}/wynko-mark.png" style="width:56px"><b>Wynko</b><span class="muted" style="margin-left:auto">now</span></div>
        <div style="margin-top:14px">That was 40 minutes ago. Thermodynamics is still due.</div>
      </div>
      <h2 class="h2" style="font-size:96px;margin-top:80px">Put the phone<br>to <em>sleep.</em></h2>`,
    cta: 'Lock in tonight',
  },

  // ───────────────────────── 28 Not until March
  {
    id: '28', slug: 'not-an-app-that-works-until-march', size: 'feed',
    body: `
      <div class="eyebrow">// Built to last</div>
      <h1 class="h1" style="font-size:118px;margin-top:28px">Not an app that works until <em>March.</em></h1>
      <div class="months">
        ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'].map((m, i) => `<div class="mo"><div class="mbar" style="height:${[260, 250, 262, 255, 266, 270][i]}px"></div><span>${m}</span></div>`).join('')}
      </div>
      <p class="lead">Motivation comes and goes. A system doesn't ask whether you feel like it today. It just runs.</p>`,
    cta: 'Start the system',
  },

  // ───────────────────────── 29 WynkoHead
  {
    id: '29', slug: 'wynkohead-program', size: 'square',
    body: `
      <div class="eyebrow">WynkoHead program</div>
      <h1 class="h1" style="font-size:96px;margin-top:24px">Build your crew.<br><em>Earn a real share.</em></h1>
      <div class="card" style="margin-top:48px">
        <div class="mono" style="font-size:40px;color:var(--ink)">wynko.in/r/kavya</div>
        <div class="row between" style="margin-top:22px">
          <div><span class="big-num">12</span> <span class="muted">joined through you</span></div>
          <div class="pill-green">● revenue share active</div>
        </div>
      </div>
      <p class="small" style="margin-top:28px">Not get-rich-quick. A genuine revenue share that grows as the platform grows.</p>`,
    cta: 'Become a WynkoHead',
  },

  // ───────────────────────── 30 Final CTA (story)
  {
    id: '30', slug: 'ready-in-60-seconds', size: 'story',
    body: `
      <div class="center col" style="margin-top:20px">
        <img src="{{A}}/wynko-mark.png" style="width:256px;filter:drop-shadow(0 30px 80px rgba(255,138,61,.35))">
        <div class="wordmark"><b>W</b>YNKO</div>
        <div class="tagline" style="margin-top:14px">Focus · Study · Together</div>
      </div>
      <h1 class="h1 tc" style="font-size:118px;margin-top:40px">Ready in<br><em>60 seconds.</em></h1>
      <div class="col gap-20" style="margin-top:60px">
        ${[['01', 'Choose your subjects'], ['02', 'Enter your exam date'], ['03', 'Study, then tick it off'], ['04', 'Lock in when needed']].map(([n, t]) => `
          <div class="step"><span class="mono or">${n}</span>${t}</div>`).join('')}
      </div>`,
    cta: 'Lock in, it\'s free',
  },
];
