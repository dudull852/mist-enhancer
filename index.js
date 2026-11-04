/* =====================================================================
   薄雾设置 (mist-enhancer) — 为「薄雾」主题提供可视化设置
   ---------------------------------------------------------------------
   设计铁律
   1. 本插件只做「遥控器」：静态外观全部留在 theme.css。
      插件只向 <html> 写 --mist-* 的内联变量值，不改 DOM 结构。
   2. 只在薄雾主题下工作。判定依据是思源写在 <html> 上的
      data-light-theme / data-dark-theme，切走时把自己的痕迹全部撤掉。
   3. 文档树图标不靠 CSS。思源默认图标是
      <span class="b3-list-item__icon"><svg><use xlink:href="#iconNotebook"/></svg></span>
      用户自定义过图标的会变成
      <span class="b3-list-item__icon ariaLabel" aria-label="修改图标">🌀</span>
      所以：带 aria-label 的一律跳过；只改默认四件套
      (iconNotebook / iconFileText / iconFile / iconLock) 的 use href。
      —— 用 CSS 覆盖 .b3-list-item__icon 会顶掉思源的「换图标」热区，
         薄雾主题 0.2.12 踩过这个坑，绝不再犯。
   ===================================================================== */

const { Plugin, Dialog, showMessage } = require("siyuan");

/* 主题的包名（= 主题文件夹名，也是集市上的包名）。
   2026-11-03 上架集市时从「薄雾」改成 ASCII 的 mist —— 集市只接受可打印 ASCII 包名。
   用户看到的中文名是 theme.json 的 displayName，与这里无关。 */
const THEME_NAME = "mist";
const STORE_FILE = "settings.json";
const STYLE_ID = "mist-enhancer-style";
const FLAG_ATTR = "data-mist-plugin";

/* 思源默认图标的四个 symbol，来自 common.js:
   {notebook:"iconNotebook", folder:"iconFileText", file:"iconFile", lock:"iconLock"} */
const ICON_NOTEBOOK = "iconNotebook";
const ICON_FOLDER = "iconFileText";
const ICON_FILE = "iconFile";
const ICON_LOCK = "iconLock";

const TOPBAR_ICON =
  '<svg viewBox="0 0 32 32" width="16" height="16" fill="none" stroke="currentColor" ' +
  'stroke-width="2.1" stroke-linecap="round"><path d="M6 11.5h20M3.5 17h25M8 22.5h16"/></svg>';

/* 设置页开在右侧停靠栏里（不是居中弹窗）：改一个数值，编辑器就在左边，
   所见即所得，不用「改 → 关 → 看 → 再开」。
   停靠项在 DOM 里的 data-type = 插件名 + 下面这个 type，即 mist-enhancer mistSettings。
   宽度只给首次默认值，用户拖过之后思源把宽度记在 conf 的 LOCAL_PLUGIN_DOCKS 里。 */
const DOCK_TYPE = "mistSettings";
const DOCK_ICON_ID = "iconMistEnhancer";
const DOCK_ICON_SYMBOL =
  '<symbol id="iconMistEnhancer" viewBox="0 0 32 32">' +
  '<path d="M6 11.5h20M3.5 17h25M8 22.5h16" fill="none" stroke="currentColor" ' +
  'stroke-width="2.1" stroke-linecap="round"/></symbol>';

/* 磨砂颗粒层用的噪点底图（URL 编码过，直接塞进 background-image）。
   # 必须写成 %23，否则 CSS 里会被当成 id 片段。 */
const GRAIN_SVG =
  "%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E" +
  "%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E" +
  "%3Crect width='120' height='120' filter='url(%23n)' opacity='.28'/%3E%3C/svg%3E";

/* 0.2.0 曾用 /plugins/mist-enhancer/assets/bg/ 存内置预设背景图，0.2.1 已移除。
   用来识别老设置里的失效 URL。 */
const LEGACY_BG_PREFIX = "/plugins/mist-enhancer/assets/";

/* ===== 本机字体探测（0.2.11）=====
   原来字体框挂的是 <datalist>，里头 6 个名字是写死的：既不是本机实况，
   Electron 那个原生下拉在 348px 侧栏里还会被裁一截、滚不利索。改成自己探测：
     · 路子一：Chromium 的 queryLocalFonts()（本地字体访问 API），一次拿完整清单；
       权限被拒就抛错，自动降到路子二。
     · 路子二：canvas 度量法 —— 拿下面这份常见字体名单逐个量同一串字的宽度，
       量出来和后备字体不一样就说明这台机器装了。无需任何权限，Win/mac 通用。
   中文互联网常见免费字体（霞鹜/更纱/得意黑/ MiSans / HarmonyOS…）也都在名单里，
   探测不到只是本机没装，不影响手打。 */
const FONT_CANDIDATES = [
  /* Windows 中文 */
  "Microsoft YaHei", "微软雅黑", "Microsoft YaHei UI", "SimSun", "宋体", "SimHei", "黑体",
  "KaiTi", "楷体", "FangSong", "仿宋", "DengXian", "等线", "Microsoft JhengHei", "微软正黑体",
  "PMingLiU", "新细明体", "MingLiU", "细明体", "MS Gothic", "MS PGothic", "MS Mincho", "Meiryo",
  "Meiryo UI", "Yu Gothic", "Yu Gothic UI", "Malgun Gothic", "맑은 고딕", "Mongolian Baiti",
  /* macOS 中文（双机同步时也能探到） */
  "PingFang SC", "Songti SC", "Heiti SC", "STHeiti", "STSong", "STKaiti", "STFangsong",
  "Hiragino Sans GB", "Noto Sans SC", "Noto Serif SC", "Noto Sans TC", "Noto Serif TC",
  "Noto Sans JP", "Noto Serif JP", "Noto Sans KR", "Noto Serif KR",
  /* 中文开源 / 免费商用 */
  "Source Han Sans SC", "Source Han Serif SC", "思源黑体", "思源宋体", "LXGW WenKai", "霞鹜文楷",
  "LXGW WenKai Screen", "LXGW WenKai Mono", "LXGW Neo XiHei", "霞鹜新晰黑", "LXGW Marker Gothic",
  "Smiley Sans Oblique", "得意黑", "Alibaba PuHuiTi", "阿里巴巴普惠体", "Alibaba Sans",
  "HarmonyOS Sans SC", "HarmonyOS Sans", "MiSans", "MiSans Normal", "MiSans TC", "Sarasa Mono SC",
  "更纱黑体", "Sarasa Gothic SC", "Sarasa Ui SC", "Fusion Pixel", "Zpix", "最像素",
  "站酷高端黑", "站酷快乐体", "站酷小薇LOGO体", "站酷庆科黄油体", "优设标题黑", "思源真黑体",
  "荆南绿州枯叶体", "霞鹜尚智黑", "折叠等距黑体", "CJK Radicals Supplement",
  /* 等宽 / 代码 */
  "JetBrains Mono", "Fira Code", "Cascadia Code", "Cascadia Mono", "Consolas", "SF Mono",
  "Menlo", "Monaco", "Inconsolata", "Source Code Pro", "Hack", "Roboto Mono", "Ubuntu Mono",
  "DejaVu Sans Mono", "Liberation Mono", "IBM Plex Mono", "Space Mono", "Anonymous Pro",
  "Iosevka", "Monaspace Neon", "Monaspace Xenon", "Maple Mono", "IntelOne Mono", "Geist Mono",
  "Commit Mono", "Martian Mono", "Sometype Mono", "Droid Sans Mono", "Noto Sans Mono",
  "Courier New", "Lucida Console", "OCRA", "Prestige Elite Std",
  /* Windows 西文常见 */
  "Segoe UI", "Arial", "Arial Black", "Calibri", "Cambria", "Candara", "Constantia", "Corbel",
  "Franklin Gothic Medium", "Georgia", "Impact", "Lucida Sans Unicode", "Palatino Linotype",
  "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana", "Comic Sans MS", "Garamond",
  "Book Antiqua", "Century Gothic", "Century Schoolbook", "Ebrima", "Gadugi", "Ink Free",
  "Sitka", "Newsreader", "Rockwell", "Playbill", "Stencil", "Wingdings", "Webdings",
  /* 西文设计 / 开源常见 */
  "Montserrat", "Roboto", "Open Sans", "Lato", "Poppins", "Inter", "Nunito", "Raleway",
  "Oswald", "Playfair Display", "Merriweather", "Source Sans Pro", "Work Sans", "IBM Plex Sans",
  "IBM Plex Serif", "Space Grotesk", "DM Sans", "DM Serif Display", "Manrope", "Outfit", "Sora",
  "Urbanist", "Barlow", "Karla", "Rubik", "Mulish", "Figtree", "Geist", "Bebas Neue", "Anton",
  "Lobster", "Pacifico", "Dancing Script", "Caveat", "Permanent Marker", "Righteous", "Bungee",
  "Titan One", "Fredoka", "Comfortaa", "Quicksand", "Josefin Sans", "Libre Baskerville",
  "Cormorant", "EB Garamond", "Crimson Text", "Lora", "PT Sans", "PT Serif", "Noto Sans",
  "Noto Serif", "Ubuntu", "Cantarell", "Fira Sans", "Oxygen", "Hind", "Mukta", "Titillium Web",
  "Exo", "Chakra Petch", "Orbitron", "Audiowide", "Press Start 2P", "Silkscreen", "Share Tech Mono",
  "Avenir", "Avenir Next", "Futura", "Optima", "Helvetica", "Helvetica Neue", "Didot", "Baskerville",
  "Chalkboard", "Marker Felt", "Courier", "American Typewriter", "Bradley Hand", "Savoye LET",
];

const DEFAULT_STATE = {
  light: {
    sideColor: "#f2f5f8",
    sideAlpha: 100,
    editorColor: "#ffffff",
    editorAlpha: 100,
    dockColor: "#ffffff",
    dockAlpha: 100,
    topColor: "#ffffff",
    topAlpha: 100,
    /* 强调色（0.2.27）：空 = 用 theme.css 里的默认蓝。
       只有「一键套用」里带 accent 的预设（如仿 wolai）才写值，
       切回其它预设会把它清掉，恢复主题默认。 */
    accent: "",
    /* 区域分割线（0.2.28）："" = 主题默认那条灰线；"none" = 不画。
       仿 wolai 那套把它设成 none —— 顶栏下边线 / 目录右边线 / 右面板左边线
       都吃 --mist-line，一处设透明三条一起消失。
       ⚠️ 这条线是 0.2.10 老板特意要求补回来的，所以别默认关，只放在预设里。 */
    line: "",
  },
  dark: {
    sideColor: "#282a30",
    sideAlpha: 90,
    editorColor: "#1e2024",
    editorAlpha: 90,
    dockColor: "#282a30",
    dockAlpha: 92,
    topColor: "#1c1e22",
    topAlpha: 100,
    accent: "",
    line: "",
  },
  bg: { img: "", fit: "cover", pos: "center", scope: "window" },
  font: { editorFont: "", editorSize: 16, treeFont: "", treeSize: 14, titleSize: 26,
    /* 字重（2026-11-04）：交给用户自己填数字看效果，不再写死在主题里。
       editorWeight 正文 / headingWeight 多级标题 / treeWeight 文档树 / titleWeight 文档标题。
       注意：真变细需要「可变字体」支撑；普通字体只有 400/700 几档，填 530 之类会就近取。
       缺省值：正文 400（原生）、标题 530（与主题 2.10 默认一致）、目录 400（原生）、
               文档标题 600（思源原生半粗档，与多级标题同基准，用户可调）。 */
    editorWeight: 400, headingWeight: 530, treeWeight: 400, titleWeight: 600 },
  contrast: 50,
  icons: { nb: ICON_NOTEBOOK, doc: ICON_FILE },
  /* 导图配色（0.2.25）：保留思源原色相，只把每个节点 / 连线的颜色降饱和 + 提亮。
     想留思源原样（一点不减淡）就把它关掉，见 msbMmStop()。 */
  mindmap: { enable: true },

  /* ===== 表格宽度自适应编辑器（用户请求）=====
     默认关。开启后：表格宽度 ≤ 编辑区，超出时按列比例缩到编辑区宽；
     内容少时仍保持窄、不拉伸。实现是给 html 打 data-mist-table-fit，
     由 theme.css 里 [data-mist-table-fit] 那段接管表格尺寸。 */
  tableFit: false,

  /* ===== 浮动面板（0.2.9）=====
     浮动布局 = 侧边面板「取消固定」后压在编辑区之上的浮层（DOM 上带 layout--float）。
     ‼ 前置硬事实（实跑量出来的，别再猜）：
        面板显隐是**改 inline style**：
          展开 → transform:translateX(34px)  + opacity:1   （34 = 图标栏宽度）
          收起 → transform:translateX(-247px) + opacity:0  （247 ≈ 面板宽 240 + 7 余量）
        配合原生 transition: transform .2s, opacity .3s。
      由此两条铁律：
        1. 绝对不能在外层改 transform —— inline transform 负责把面板"推到图标栏右边"，
           一旦被 CSS 动画覆盖，面板就会错位到窗口最左边。
        2. 动画**不能靠 CSS 自动触发** —— 显隐不切类名，只改 inline style，
           CSS animation 只在元素首次套上规则时跑一次。所以由插件轮询 inline opacity，
           检测到"展开"就给目标层补一个临时 class 进来重播（见 playFloatAnim）。
      位移/缩放一律放在内容层 .layout--float > .fn__flex-1 上（这层没人动它）。
      外间距用 translate（与 inline transform 叠加），上限 6px：
      超过 6px 时收起态右缘会露出一条（原生只留了 7px 余量）。 */
  float: {
    enable: true,
    pinBtn: true,
    radius: 16,
    blur: 18,
    sat: 170,
    alpha: 62,
    shadow: 16,
    gap: 8,
    grain: true,
    anim: "push",
    dur: 300,
    ease: "cubic-bezier(.16,1,.3,1)",
  },

  /* ===== 手机端悬浮面板（0.2.17）=====
     只存两样：顺序、隐藏项。都以稳定 id 记录 ——
       侧栏页  panel:<left|right>:<data-type>
       插件设置 setting:<插件名>
       插件命令 cmd:<命令 id>
       顶栏按钮 top:<id 或图标>
     side / posY 记把手贴在左还是右、停在屏幕纵向的百分比。 */
  msb: { order: [], hidden: [], side: "right", posY: 50 },
};

/* 弹出动画方案。none = 不额外加特效，只保留思源自己的 transition。 */
const FLOAT_ANIMS = [
  { key: "none", name: "原生滑出（不加特效）", hint: "只用思源自带的位移过渡，最省资源" },
  { key: "fade", name: "淡入", hint: "只做透明度，最克制（动画挂在外壳上）" },
  { key: "push", name: "轻推淡入", hint: "内容位移 14px 后进场，日常最耐看" },
  { key: "scale", name: "缩放凝聚", hint: "以左边缘为原点抽出，macOS 抽屉感" },
  { key: "spring", name: "回弹", hint: "过冲 4px 再收回，偏活泼" },
  { key: "veil", name: "磨砂凝聚", hint: "从左揭开 + 模糊由厚薄过渡，最有质感也最重" },
];

const FLOAT_EASES = [
  ["cubic-bezier(.16,1,.3,1)", "柔出 expo（推荐）"],
  ["cubic-bezier(.22,.61,.36,1)", "标准减速"],
  ["cubic-bezier(.32,.72,0,1)", "锐减·苹果感"],
  ["cubic-bezier(.34,1.56,.64,1)", "回弹 overshoot"],
  ["cubic-bezier(.4,0,.2,1)", "标准对称"],
  ["linear", "匀速"],
];

/* 面板控件 data-k → state.float 字段名 */
const FLOAT_KMAP = {
  floatAnim: "anim",
  floatDur: "dur",
  floatEase: "ease",
  floatRadius: "radius",
  floatBlur: "blur",
  floatSat: "sat",
  floatAlpha: "alpha",
  floatShadow: "shadow",
  floatGap: "gap",
};

/* 预设：一次写入浅色 + 暗色两套，点完还能继续微调。
   只改颜色与透明度，不碰字体、图标、背景图 —— 那些是内容层面的选择，
   不该被「换个观感」顺手清掉。
   accent（0.2.27）：强调色，可给字符串（浅暗同色）或 {light,dark}。
   留空 = 不染强调色，用 theme.css 的默认蓝。务必每套都显式带这个键，
   否则写的是 undefined，合并时旧值会残留（红框切回「雾」还是红）。 */
const PRESETS = [
  {
    key: "mist",
    name: "雾",
    accent: "",
    light: { sideColor: "#f2f5f8", sideAlpha: 100, editorColor: "#ffffff", editorAlpha: 100, dockColor: "#ffffff", dockAlpha: 100, topColor: "#ffffff", topAlpha: 100 },
    dark: { sideColor: "#282a30", sideAlpha: 90, editorColor: "#1e2024", editorAlpha: 90, dockColor: "#282a30", dockAlpha: 92, topColor: "#1c1e22", topAlpha: 100 },
  },
  {
    key: "clear",
    name: "清透",
    accent: "",
    light: { sideColor: "#eef2f6", sideAlpha: 62, editorColor: "#ffffff", editorAlpha: 55, dockColor: "#f7f9fb", dockAlpha: 72, topColor: "#ffffff", topAlpha: 70 },
    dark: { sideColor: "#22252b", sideAlpha: 66, editorColor: "#1a1c20", editorAlpha: 58, dockColor: "#24272d", dockAlpha: 70, topColor: "#1c1e22", topAlpha: 72 },
  },
  {
    key: "paper",
    name: "纸感",
    accent: "",
    light: { sideColor: "#f7f2e8", sideAlpha: 96, editorColor: "#fffdf8", editorAlpha: 94, dockColor: "#fbf7ef", dockAlpha: 96, topColor: "#fdfaf3", topAlpha: 96 },
    dark: { sideColor: "#2a2620", sideAlpha: 92, editorColor: "#201d18", editorAlpha: 90, dockColor: "#2a2620", dockAlpha: 92, topColor: "#201d18", topAlpha: 94 },
  },
  {
    /* 仿 wolai（0.2.27）：中性浅灰侧栏 + 纯白正文 + 珊瑚红强调。
       ‼ 侧栏色 0.2.28 改过：第一版给的是 #faf3f1（淡粉），老板实机对着 wolai
       截图说「没有这么红」—— 采像素确认 wolai 左侧导航是 **#f5f5f5 中性灰**，
       粉只出现在选中行。别再往侧栏上刷粉。
       强调色 #e8533f 是它那套红（选中项 / 标签页 / 按钮），
       同时写进 --b3-theme-primary，原生按钮、链接、选中态才一起变。
       line:"none" —— wolai 没有区域分割线（顶栏下 / 侧栏右都干净）。 */
    key: "wolai",
    name: "仿 wolai",
    accent: { light: "#e8533f", dark: "#f0705c" },
    line: "none",
    light: { sideColor: "#f5f5f5", sideAlpha: 100, editorColor: "#ffffff", editorAlpha: 100, dockColor: "#ffffff", dockAlpha: 100, topColor: "#ffffff", topAlpha: 100 },
    dark: { sideColor: "#252525", sideAlpha: 100, editorColor: "#1c1c1c", editorAlpha: 100, dockColor: "#252525", dockAlpha: 100, topColor: "#1c1c1c", topAlpha: 100 },
  },
  {
    key: "night",
    name: "夜雾",
    accent: "",
    light: { sideColor: "#e8ebef", sideAlpha: 78, editorColor: "#f4f6f8", editorAlpha: 72, dockColor: "#eef1f4", dockAlpha: 80, topColor: "#f0f3f6", topAlpha: 80 },
    dark: { sideColor: "#1f2228", sideAlpha: 82, editorColor: "#17191d", editorAlpha: 78, dockColor: "#212429", dockAlpha: 84, topColor: "#16181c", topAlpha: 88 },
  },
];

/* 取某套预设在指定明暗下的强调色（""=不染） */
function presetAccent(p, mode) {
  const a = p && p.accent;
  if (!a) return "";
  return typeof a === "string" ? a : (a[mode] || "");
}

/* ===== 背景场景预设（内置底图，点一下套用，不用上传） =====
   0.2.8 新增。和「外观预设」(PRESETS) 是两回事：PRESETS 只改颜色/透明度、
   不碰背景图；这里直接提供底图，写入 state.bg.img，复用现有背景应用链路。
   纯色 4 + 柔和多彩/插画 3 + 科技 1 = 8 套，与 HTML 预览页一一对应；
   底部那张橙粉蓝紫渐变就是这里的「彩」。
   0.2.11：删掉霓虹/星尘/电路/点阵/量子 5 套暗色科技图（嫌不好看），只留极光。
   已套用过的人不受影响 —— 背景是数据 URI，存在 settings.json 里，删预设
   只是不再显示那张卡，当前背景照常显示。 */
function mkSceneSvg(key) {
  const W = 1600, H = 1000;
  const solid = (c) =>
    `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'><rect width='${W}' height='${H}' fill='${c}'/></svg>`;
  switch (key) {
    case "white": return solid("#ffffff");
    case "gray": return solid("#e9ebee");
    case "beige": return solid("#f3ede3");
    case "blue": return solid("#dde6f0");
    case "colorful":
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>
        <defs>
          <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0' stop-color='#ffd3a5'/><stop offset='.35' stop-color='#fd6585'/>
            <stop offset='.7' stop-color='#6a82fb'/><stop offset='1' stop-color='#34e0c2'/>
          </linearGradient>
          <radialGradient id='r' cx='.2' cy='.25' r='.55'>
            <stop offset='0' stop-color='#ffffff' stop-opacity='.55'/><stop offset='1' stop-color='#ffffff' stop-opacity='0'/>
          </radialGradient>
        </defs>
        <rect width='${W}' height='${H}' fill='url(#g)'/>
        <rect width='${W}' height='${H}' fill='url(#r)'/>
      </svg>`;
    case "geo":
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>
        <rect width='${W}' height='${H}' fill='#f0f0f5'/>
        <circle cx='380' cy='320' r='230' fill='#ff9a9e' opacity='.85'/>
        <rect x='920' y='180' width='420' height='420' rx='48' fill='#6a82fb' opacity='.8' transform='rotate(15 1130 390)'/>
        <path d='M120 760 L420 500 L760 760 Z' fill='#fad0c4' opacity='.9'/>
        <circle cx='1330' cy='780' r='180' fill='#34e0c2' opacity='.8'/>
      </svg>`;
    case "nature":
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>
        <defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0' stop-color='#8fb8e8'/><stop offset='1' stop-color='#e9f3fb'/>
        </linearGradient></defs>
        <rect width='${W}' height='${H}' fill='url(#g)'/>
        <circle cx='1280' cy='260' r='130' fill='#fff3c4' opacity='.92'/>
        <path d='M0 620 Q400 520 800 610 T1600 590 V1000 H0 Z' fill='#9fce8f'/>
        <path d='M0 720 Q500 640 1000 710 T1600 690 V1000 H0 Z' fill='#6fae6a'/>
      </svg>`;
    case "aurora":
      return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>
        <defs>
          <linearGradient id='base' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#ffd9ef'/><stop offset='.45' stop-color='#d8f1ff'/><stop offset='1' stop-color='#ece6ff'/></linearGradient>
          <linearGradient id='a1' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff4696' stop-opacity='.5'/><stop offset='.5' stop-color='#ff4696' stop-opacity='0'/></linearGradient>
          <linearGradient id='a2' x1='0' y1='.3' x2='1' y2='.7'><stop offset='0' stop-color='#28d2be' stop-opacity='.45'/><stop offset='.5' stop-color='#28d2be' stop-opacity='0'/></linearGradient>
          <linearGradient id='a3' x1='0' y1='.1' x2='1' y2='.9'><stop offset='0' stop-color='#506eff' stop-opacity='.4'/><stop offset='.5' stop-color='#506eff' stop-opacity='0'/></linearGradient>
        </defs>
        <rect width='${W}' height='${H}' fill='url(#base)'/>
        <rect width='${W}' height='${H}' fill='url(#a1)'/>
        <rect width='${W}' height='${H}' fill='url(#a2)'/>
        <rect width='${W}' height='${H}' fill='url(#a3)'/>
      </svg>`;
    default: return solid("#e9ebee");
  }
}
function sceneDataUri(key) {
  return "data:image/svg+xml," + encodeURIComponent(mkSceneSvg(key));
}
const BG_SCENES = [
  { key: "white", name: "白", group: "基础" },
  { key: "gray", name: "灰", group: "基础" },
  { key: "beige", name: "米", group: "基础" },
  { key: "blue", name: "蓝", group: "基础" },
  { key: "colorful", name: "彩", group: "柔和" },
  { key: "geo", name: "几何", group: "柔和" },
  { key: "nature", name: "自然", group: "柔和" },
  { key: "aurora", name: "极光", group: "科技" },
].map((s) => Object.assign({}, s, { uri: sceneDataUri(s.key) }));

/* 对比度 50 = 主题默认文字色。0 → 贴近背景，100 → 纯黑/纯白。
   数值取自 theme.css 的 :root 与暗色段。 */
const TEXT_BASE = {
  light: {
    onBg: [92, 98, 106],
    onSurface: [107, 112, 121],
    onSurfaceLight: [108, 112, 121],
    onSurfaceLighter: [182, 187, 194],
    bg: [255, 255, 255],
    far: [0, 0, 0],
  },
  dark: {
    onBg: [200, 204, 210],
    onSurface: [168, 173, 181],
    onSurfaceLight: [168, 173, 181],
    onSurfaceLighter: [107, 112, 121],
    bg: [28, 30, 34],
    far: [255, 255, 255],
  },
};

const TEXT_VARS = [
  ["--b3-theme-on-background", "onBg"],
  ["--b3-theme-on-surface", "onSurface"],
  ["--b3-theme-on-surface-light", "onSurfaceLight"],
  ["--b3-theme-on-surface-lighter", "onSurfaceLighter"],
];

/* ============================ 纯函数 ============================ */

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function mergeDeep(base, patch) {
  const out = clone(base);
  if (!patch || typeof patch !== "object") return out;
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object") {
      out[k] = mergeDeep(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function hexToRgb(hex) {
  let h = String(hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [255, 255, 255];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/* ---- RGB / HSV 互转（自绘取色器用） ----
   不引第三方库：只需要 h/s/v 三档 + hex，十几行就够。 */
function rgbToHsv(rgb) {
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function hsvToHex(h, s, v) {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  const seg = Math.floor(hh / 60) % 6;
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg];
  return (
    "#" +
    rgb
      .map((n) => {
        const q = Math.max(0, Math.min(255, Math.round((n + m) * 255)));
        return q.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

function rgbaOf(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  const a = Math.max(0, Math.min(100, Number(alpha))) / 100;
  return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
}

function mixRgb(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function contrastColor(base, bg, far, c) {
  const v = Math.max(0, Math.min(100, Number(c)));
  if (v < 50) return mixRgb(base, bg, ((50 - v) / 50) * 0.86);
  if (v > 50) return mixRgb(base, far, (v - 50) / 50);
  return base;
}

function cssFont(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  if (n.includes(",")) return n;
  return '"' + n + '", var(--b3-font-family)';
}

/* 插件显示名：displayName 在 plugin.json 里是多语言对象，直接拼字符串会得到
   [object Object]，插件设置列表里就成了一串看不懂的东西。 */
function pluginLabelOf(p) {
  const dn = p && p.displayName;
  if (typeof dn === "string" && dn) return dn;
  if (dn && typeof dn === "object") {
    return dn.zh_CN || dn.default || dn.en_US || (p && p.name) || "";
  }
  return (p && p.name) || "";
}

function bgSizeOf(fit) {
  return fit === "contain" ? "contain" : fit === "repeat" ? "auto" : "cover";
}
function bgRepeatOf(fit) {
  return fit === "repeat" ? "repeat" : "no-repeat";
}
function bgPosOf(pos) {
  return pos === "top" ? "top center" : pos === "bottom" ? "bottom center" : "center";
}

/* 图片压到合理尺寸再存 data.json：原图直存储会把 settings.json 撑到几 MB，
   既拖慢插件启动，也会跟着思源的云同步来回传。 */
function compressImage(file, maxWidth, quality) {
  const MAX_W = maxWidth || 1920;
  const Q = quality || 0.82;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => {
      const raw = String(reader.result || "");
      const img = new Image();
      img.onerror = () => reject(new Error("不是有效的图片"));
      img.onload = () => {
        if (img.width <= MAX_W && raw.length < 700 * 1024) {
          resolve(raw);
          return;
        }
        const scale = Math.min(1, MAX_W / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(cv.toDataURL("image/jpeg", Q));
        } catch (e) {
          resolve(raw);
        }
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

/* 思源手机端左右抽屉里的内置页面。
   data-type 是写死在 mobile/index.html 里的，只有这 7 个；
   同一个 .toolbar__scroll 里 data-type 不在表内的，就是插件注册的侧栏页。 */
const MSB_BUILTIN = {
  "sidebar-file-tab": "文档树",
  "sidebar-bookmark-tab": "书签",
  "sidebar-tag-tab": "标签",
  "sidebar-inbox-tab": "收件箱",
  "sidebar-outline-tab": "大纲",
  "sidebar-backlink-tab": "反向链接",
  "sidebar-agent-tab": "智能体",
};

/* 插件命令的 label 经常是 i18n key（如 addDoc）或函数名，直接显示很难看。
   带中文的原样用；纯 ASCII 驼峰就拆词，让用户至少认得出大概是什么。 */
function msbCmdLabel(c) {
  const raw = c && (c.label || c.name || c.langKey || c.id);
  let s2 = String(raw || "").trim();
  if (!s2) return "命令";
  if (!/[\u4e00-\u9fa5]/.test(s2) && /^[A-Za-z][A-Za-z0-9]*$/.test(s2)) {
    s2 = s2.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  }
  return s2.slice(0, 14);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ================= 思维导图配色（0.2.25「原色减淡」）=================

   ❗为什么只能 JS 接管，CSS 彻底没戏（2026-10-31 查明）：
     思源导图的颜色不是 CSS 变量，是 JS 按 47 套内置调色板算完**写死**的：
       节点 → el.style.backgroundColor / el.style.color（外加 --mindmap-node-text-color）
       连线 → <canvas class="mindmap-view__canvas"> 2D 上下文里的 strokeStyle
     theme.css 顶多叠一层半透明蒙版把颜色压淡；压淡 ≠ 换配色。

   ✅ 落地的是「保留思源原色相，只降饱和 + 提亮」：
      老板要的是「就在现有颜色上改，减淡」，不是换一套配色 ——
      0.2.24 那版极简单色（全图绿）已被否掉，别再往回改。
      每个节点 / 每条线读它**自己的**原色，就地算淡一档的同色相值：
        底色  明度抬到 93%（暗色 24%），饱和度保留 0.52 倍
        文字  明度压到 36%（暗色 82%），饱和度保留 0.62 倍
        连线  明度 64%（暗色 54%），饱和度保留 0.55 倍
      色相一个都不动 —— 分支还是原来那条分支的颜色，只是整体软下来。

   ‼ 三个坑记在这里，别再踩：
     ① 思源自己也在不停改这些 inline 值 —— updateColors() 在缩放 / 选中 /
        改数据时都会重跑。所以必须挂 MutationObserver 盯着 style 变化重写回去。
        防死循环靠「值相等就跳过」：写进去的值浏览器会归一化成 rgb()，
        下次比较用的就是归一化后的字符串，天然收敛。输出因此只能是 rgb()。
     ② 连线在 canvas 上，DOM 摸不到。只能 hook HTMLCanvasElement.prototype.getContext，
        对 .mindmap-view__canvas 这一个画布包一层 strokeStyle 的 setter；
        其它 canvas 一概不碰。_mmOn=false 时 setter 原样透传，卸载后不残留。
     ③ 节点无色（叶子透明）时**绝不能**给它补底色：思源只有 --colored 的节点才有
        backgroundColor，补上去会多出一堆色块。
   ========================================================= */

/* ===== 减淡参数。嫌淡得不够 / 淡过头，只改这几个数字 =========
     S     = 饱和度「保留比例」（0.5 ≈ 砍掉一半饱和度）
     L     = 目标明度（%）
     lnUp  = 连线在原本明度上再抬几个点；lnMax 是封顶
   浅色下底色统一抬到 93%，所有分支亮度一致，只靠色相区分；
   文字压到 36%，保证 93% 的浅底上仍有 5:1 以上对比度
   （对比度不达标时 mmSoften 会自动再压两档，绿黄系靠它兜）。 */
const MM_TONE = {
  light: {
    bgS: 0.52,
    bgL: 93,
    fgS: 0.62,
    fgL: 36,
    fgCr: 4.6,
    leafS: 0.45,
    leafL: 0,
    lnS: 0.55,
    lnL: 63,
    lnUp: 8,
    lnMax: 78,
  },
  dark: {
    bgS: 0.4,
    bgL: 24,
    fgS: 0.45,
    fgL: 82,
    fgCr: 4.6,
    leafS: 0.4,
    leafL: 68,
    lnS: 0.5,
    lnL: 54,
    lnUp: 0,
    lnMax: 68,
  },
};

/* 任意 CSS 颜色串 → [r, g, b]。hex / rgb() / rgba() 三种覆盖思源全部写法。
   alpha 直接丢掉：这几个位置思源用的都是实色，带透明的节点我们不参与。 */
function mmParseColor(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  const m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    if (p.length < 3 || !isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) return null;
    if (p.length > 3 && isFinite(p[3]) && p[3] < 0.5) return null;
    return [p[0], p[1], p[2]];
  }
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return [
      parseInt(s[1] + s[1], 16),
      parseInt(s[2] + s[2], 16),
      parseInt(s[3] + s[3], 16),
    ];
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) {
    const n = parseInt(s.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return null;
}

/* rgb → {h, s, l}（h: 0~360，s/l: 0~100） */
function mmToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: h, s: s * 100, l: l * 100 };
}

/* hsl → "rgb(r, g, b)"。
   ‼ 输出必须走 rgb()：浏览器会把它归一化成 rgb 串，下次读回来才能跟记录值相等，
     否则「写 hsl 读 rgb」永不相等 → 每帧重写 → 死循环。 */
function mmHslRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 60;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 1) {
    r = c;
    g = x;
  } else if (h < 2) {
    r = x;
    g = c;
  } else if (h < 3) {
    g = c;
    b = x;
  } else if (h < 4) {
    g = x;
    b = c;
  } else if (h < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return (
    "rgb(" +
    Math.round((r + m) * 255) +
    ", " +
    Math.round((g + m) * 255) +
    ", " +
    Math.round((b + m) * 255) +
    ")"
  );
}

/* 中性色判定：灰 / 黑 / 白 不参与减淡（改它只会让灰色变脏）。
   阈值 0.10，别调大：peace 调色板里有个 #b5ad99（米灰），色相跨度 0.155，
   它是个真分支色，落到阈值里就会被整条分支漏掉，跟别的分支不一致；
   而真正的网格线 / 阴影跨度都在 0.05 以内。 */
function mmNeutral(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx <= 0) return true;
  return (mx - mn) / mx < 0.1;
}

/* 两个颜色串是不是同一个色。只比 RGB 数值，不比字符串 ——
   "rgb(244,235,224)" 与 "rgb(244, 235, 224)" 必须判等，否则防死循环的门就漏了。 */
function mmSame(a, b) {
  if (a === b) return true;
  const x = mmParseColor(a);
  const y = mmParseColor(b);
  if (!x || !y) return false;
  return (
    Math.abs(x[0] - y[0]) < 1 && Math.abs(x[1] - y[1]) < 1 && Math.abs(x[2] - y[2]) < 1
  );
}

/* WCAG 相对亮度 / 对比度。用来给文字色兜底：
   同样的 HSL 明度，绿黄系的实际亮度比红紫高一大截 —— 只按明度定色，
   绿黄分支的字会掉到 3.9:1 看瞎眼（0.2.33 的 13 色板就是栽在这）。 */
function mmLum(c) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

function mmRatio(a, b) {
  if (!a || !b) return 0;
  const x = mmLum(a);
  const y = mmLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* 核心：一个原色 → 它自己的淡一档版本。色相一分不动。
   kind: "bg" 底色 | "fg" 文字 | "ln" 连线 */
function mmSoften(src, mode, kind) {
  const c = mmParseColor(src);
  if (!c) return null;
  const r = c[0];
  const g = c[1];
  const b = c[2];
  if (mmNeutral(r, g, b)) return null;
  const hsl = mmToHsl(r, g, b);
  const T = MM_TONE[mode];
  /* 底色：浅色下统一抬到 93%，且不许把本来就比 93% 更亮的底压暗（max 保护）；
     暗色下必须写死 24% —— 这里一旦也套 max，原色明度会把深底顶回浅色。 */
  const bgL = mode === "dark" ? T.bgL : Math.max(T.bgL, Math.min(hsl.l, 97));
  const bg = mmParseColor(mmHslRgb(hsl.h, hsl.s * T.bgS, bgL));
  if (kind === "bg") return mmHslRgb(hsl.h, hsl.s * T.bgS, bgL);
  if (kind === "ln") {
    /* 连线「只提不压」：目标明度取 max(下限, 原明度 + lnUp) 再封顶。
       直接写死 63% 会把本来就亮的线（peace 里 #fc5d62 明度 68%）压深 —— 那就不是减淡了。 */
    const l = Math.max(T.lnL, Math.min(hsl.l + T.lnUp, T.lnMax));
    return mmHslRgb(hsl.h, hsl.s * T.lnS, l);
  }
  /* 叶子文字：节点本身没有底色，字直接落在画布上。
     思源把调色板的**浅色**当字用（#58d1bb 这种），本来就不深，只是太艳。
     所以这里只有一件事：**只降饱和、明度原样保留**。
     ‼ 千万别按对比度硬压到 4.6:1 —— 那会把字压成墨绿，是「加深」不是「减淡」，
       正好和老板的诉求反着来。淡就淡着，糊了他会说，说了一次就能改。 */
  if (kind === "leaf") {
    const s = hsl.s * T.leafS;
    const l = mode === "dark" ? Math.max(hsl.l, T.leafL) : hsl.l;
    return mmHslRgb(hsl.h, s, l);
  }
  /* 文字：从基准明度起，一步一步往「更远离底色」的方向挪，
     直到对比度达标（最多 8 档）。绝大多数色第一档就够了，
     只有绿黄系会多吃两三档 —— 这正是想要的效果。 */
  const s = hsl.s * T.fgS;
  const step = mode === "dark" ? 1 : -1;
  let l = T.fgL;
  for (let i = 0; i < 8; i++) {
    const out = mmHslRgb(hsl.h, s, l);
    if (mmRatio(mmParseColor(out), bg) >= T.fgCr) return out;
    l += step;
  }
  return mmHslRgb(hsl.h, s, l);
}

/* ============================ 主类 ============================ */

class MistEnhancer extends Plugin {
  /* 图钉的点击走一次事件委托：面板会被切走重排，逐个按钮绑监听器会漏 */
  watchPin() {
    this.unwatchPin();
    this._pinClick = (ev) => {
      const btn = ev.target.closest && ev.target.closest(".mist-pin");
      if (btn) this.toggleFloatLock(btn);
    };
    document.addEventListener("click", this._pinClick, true);
  }

  unwatchPin() {
    if (this._pinClick) {
      document.removeEventListener("click", this._pinClick, true);
      this._pinClick = null;
    }
  }

  async onload() {
    this.state = clone(DEFAULT_STATE);
    this.editMode = "light";
    this._saveTimer = 0;
    this._iconTimer = 0;
    this._dlg = null;

    await this.loadState();
    this.ensureStyle();
    /* 图标必须先注册，addDock 渲染停靠项时要按 id 找 symbol */
    this.addIcons(DOCK_ICON_SYMBOL);
    this.watchTheme();

    /* 移动端：手机端保持思源默认外观（老板 2026-10-30 定：放弃手机端薄雾主题）。
       所以这里**不调 apply()** —— 不写 data-mist 标记，插件那套配色/字体/背景图
       规则在手机上全部不生效；插件在手机上只做一件事：注入悬浮面板（三类分区）。 */
    if (this.isMobile()) {
      this._mobileOnly = true;
      /* 给 <html> 打标记：设置对话框的移动端布局靠它生效。
         为什么不用 data-mist —— 手机上不套薄雾主题，data-mist 是「主题已注入」的意思；
         这两个概念必须分开，否则又回到「手机上一堆样式误伤」。 */
      document.documentElement.setAttribute("data-mist-mobile", "1");
      this.addCommand({
        langKey: "openSettings",
        callback: () => this.openSettings(),
      });
      this.initMobileSidebar();
      return;
    }
    this.addTopBarEntry();
    this.addSettingsDock();
    this.addCommand({
      langKey: "openSettings",
      callback: () => this.openSettings(),
    });
    this.watchTree();
    this.watchPin();
    this.apply();
  }

  /* 是否移动端。
     判据必须硬：思源移动端是独立的一套前端（stage/build/mobile），
     index.html 里写死了 #mobileTopBar / #mobileBottomBar，桌面端永远没有这两个节点。
     之前用 layout__mobile 之类的类名兜底是错的 —— 移动端 body 只有 fn__flex-column，
     根本不存在那些类，导致整段移动端逻辑在真机上从未执行。 */
  isMobile() {
    try {
      if (typeof this.getFrontend === "function" && this.getFrontend() === "mobile") return true;
    } catch (e) {
      /* 老版本没这方法，继续走兜底 */
    }
    if (document.getElementById("mobileTopBar") || document.getElementById("mobileBottomBar")) return true;
    return /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent || "");
  }

  onunload() {
    this.unwatch();
    this.unwatchPin();
    this.clear();
    if (this._saveTimer) clearTimeout(this._saveTimer);
    if (this._iconTimer) clearTimeout(this._iconTimer);
    if (this._dlg) {
      try {
        this._dlg.destroy();
      } catch (e) {
        /* 已经关掉了 */
      }
      this._dlg = null;
    }
    const bar = document.querySelector(".mist-topbar-entry");
    if (bar) bar.remove();
    const msb = document.querySelector(".mist-msb");
    if (msb) msb.remove();
    /* 手机端 clear() 会重建样式表（那是浮层唯一的 CSS 来源），
       卸载时必须自己收干净，否则禁用/重载插件后会留一张孤儿样式表。 */
    const st = document.getElementById(STYLE_ID);
    if (st) st.remove();
  }

  /* ---------------- 状态 ---------------- */

  async loadState() {
    try {
      const raw = await this.loadData(STORE_FILE);
      if (raw && typeof raw === "object") this.state = mergeDeep(DEFAULT_STATE, raw);
    } catch (e) {
      console.warn("[mist-enhancer] 读取设置失败，使用默认值", e);
    }
    /* 0.2.1 删掉了内置预设背景图。老设置里可能还存着那些短 URL，
       留着会指向已不存在的文件（404、背景全空），这里直接清掉。 */
    const img = this.state.bg && this.state.bg.img;
    if (typeof img === "string" && img.indexOf(LEGACY_BG_PREFIX) === 0) {
      this.state.bg.img = "";
      this.saveState();
    }
    /* 0.2.28：仿 wolai 首版把侧栏刷成了淡粉 #faf3f1，实机对着 wolai 一比对
       偏红（wolai 是 #f5f5f5 中性灰，粉只在选中行）。已经套用过的设置里存的
       是老值，不迁移的话升级后看着「没改」。只认「accent 是 wolai 红 + 侧栏是
       旧值」这对组合，不碰用户自己调过的颜色。 */
    [this.state.light, this.state.dark].forEach((s) => {
      if (!s) return;
      const acc = String(s.accent || "").toLowerCase();
      if (acc === "#e8533f" && s.sideColor === "#faf3f1") {
        s.sideColor = "#f5f5f5";
        s.line = "none";
        this.saveState();
      }
      if (acc === "#f0705c" && s.sideColor === "#251e1c") {
        s.sideColor = "#252525";
        if (s.editorColor === "#1b1615") s.editorColor = "#1c1c1c";
        if (s.dockColor === "#251e1c") s.dockColor = "#252525";
        if (s.topColor === "#191413") s.topColor = "#1c1c1c";
        s.line = "none";
        this.saveState();
      }
    });
  }

  saveState() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = 0;
      this.saveData(STORE_FILE, this.state).catch((e) =>
        console.warn("[mist-enhancer] 保存设置失败", e)
      );
    }, 400);
  }

  /* ---------------- 主题判定 ---------------- */

  isMist() {
    const ds = document.documentElement.dataset;
    const mode = ds.themeMode === "dark" ? "dark" : "light";
    const name = mode === "dark" ? ds.darkTheme : ds.lightTheme;
    if (name) return name === THEME_NAME;
    /* 移动端首屏 dataset 可能还没写上，退回配置读，否则浮层永远建不出来 */
    try {
      const a = window.siyuan && window.siyuan.config && window.siyuan.config.appearance;
      if (a) return (mode === "dark" ? a.themeDark : a.themeLight) === THEME_NAME;
    } catch (e) {
      /* 拿不到就算了 */
    }
    return false;
  }

  isDark() {
    return document.documentElement.dataset.themeMode === "dark";
  }

  modeKey() {
    return this.isDark() ? "dark" : "light";
  }

  watchTheme() {
    /* 手机端不跟主题联动：手机用思源默认主题，isMist() 恒 false，
       如果继续监听就会在切明暗时走 clear() 把浮层和样式表一起拆掉。 */
    if (this.isMobile()) return;
    this._themeObs = new MutationObserver(() => {
      if (this.isMist()) this.apply();
      else this.clear();
    });
    this._themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme-mode", "data-light-theme", "data-dark-theme", "class"],
    });
  }

  watchTree() {
    this._treeObs = new MutationObserver(() => {
      if (!this.isMist()) return;
      if (!this.needsIconPaint()) return;
      if (this._iconTimer) return;
      this._iconTimer = setTimeout(() => {
        this._iconTimer = 0;
        this.paintIcons();
      }, 160);
    });
    this._treeObs.observe(document.body, { childList: true, subtree: true });
  }

  unwatch() {
    if (this._themeObs) {
      this._themeObs.disconnect();
      this._themeObs = null;
    }
    if (this._treeObs) {
      this._treeObs.disconnect();
      this._treeObs = null;
    }
  }

  needsIconPaint() {
    const i = this.state.icons;
    return Boolean(i && ((i.nb && i.nb !== ICON_NOTEBOOK) || (i.doc && i.doc !== ICON_FILE)));
  }

  /* ---------------- 顶栏入口 ---------------- */

  addTopBarEntry() {
    const el = this.addTopBar({
      icon: TOPBAR_ICON,
      title: this.i18n.openSettings || "打开薄雾设置",
      position: "left",
      callback: () => this.openSettings(),
    });
    if (el) el.classList.add("mist-topbar-entry");
  }

  /* ---------------- 右侧停靠面板 ---------------- */

  addSettingsDock() {
    this.addDock({
      config: {
        position: "RightTop",
        size: { width: 348, height: 0 },
        icon: DOCK_ICON_ID,
        title: this.i18n.pluginName || "薄雾设置",
      },
      data: {},
      type: DOCK_TYPE,
      init: (el) => this.initDockPanel(el),
    });
  }

  initDockPanel(dock) {
    /* ❗0.2.4 修的坑：SiYuan 调 init 时传的是**停靠模型对象**，不是 DOM 元素。
       common.js 里是 `this.init(this)`，DOM 在 `dock.element` 上。
       0.2.2/0.2.3 直接把参数当元素用 → `el.classList` 是 undefined →
       TypeError → 模型构造直接中断 → 面板永远建不出来，点图标毫无反应。
       （同样的写法在 flash-memo 里是 `const el = dock.element;`，可对照。）
       这里两种都兼容：有 element 就用 element，没有就当作元素本身。 */
    const el = dock && dock.element ? dock.element : dock;
    if (!el || !el.classList) {
      console.warn("[mist-enhancer] initDockPanel 拿不到元素", dock);
      return;
    }
    el.classList.add("mist-dock-panel");
    /* 停靠面板自己没有布局样式（.dockPanel 只是个标记类），高度从 flex 链上继承。
       ❗别在这里写 display:flex —— 面板的显隐是思源的布局说了算，自己一覆盖，
         面板关着也算「看得见」，isPanelShown() 会被骗（0.2.4 踩过）。 */
    el.style.minHeight = "0";
    el.style.height = "100%";
    el.style.overflow = "hidden";

    this.editMode = this.modeKey();
    const box = document.createElement("div");
    box.className = "mist-dock";
    box.innerHTML = this.dialogHtml();
    el.appendChild(box);
    this._dockRoot = box;
    /* 和弹窗共用同一套绑定逻辑 —— 面板只是换了个容器 */
    this.bindDialog(box);
  }

  /* 打开设置：优先开右侧停靠面板，编辑器留在左边可以实时看效果。
     找不到停靠项时（面板被禁用 / 精简版没这个入口）退回居中弹窗，
     保证按钮不会点了没反应。

     ❗0.2.3 修的坑：思源的停靠项**绑的是 mousedown，不是 click**
     （`this.elements[0].parentElement.addEventListener("mousedown", …)`，
       见 common.js 里 dock 的构造）。所以 `item.click()` 是个哑炮：
       元素存在、事件也派发了，思源那个监听器根本不接 —— 表现就是
       「点了没反应」，而且因为找到了停靠项，连兜底弹窗都不会弹。
     正确做法是派发真实的 mousedown/mouseup/click 三连（bubbles:true），
     让事件冒泡到 #dockRight 上的原生监听器。 */
  openSettings() {
    /* 主题不是薄雾时，设置值一条都落不到界面上（CSS 根本没加载），
       开了面板只会制造「怎么调都没反应」的误会 —— 直接不开。
       手机端 isMist() 恒 false（手机故意用思源默认外观），所以手机不拦。 */
    if (!this.isMobile() && !this.isMist()) return;
    const item = this.findDockItem();
    if (!item) {
      this.openDialog();
      return;
    }
    if (this.isPanelShown()) {
      this.refreshDock();
      return;
    }
    this.fireDockToggle(item);
    /* 兜底：250ms 后仍没看到面板，就直接开弹窗。
       宁可给个居中的设置窗，也不能出现「点了没反应」。 */
    setTimeout(() => {
      if (this.isPanelShown()) this.refreshDock();
      else this.openDialog();
    }, 250);
  }

  findDockItem() {
    const name = String(this.name || "mist-enhancer");
    const key = name + DOCK_TYPE;
    const items = Array.from(document.querySelectorAll(".dock__item[data-type]"));
    return (
      items.find((it) => {
        const t = it.getAttribute("data-type") || "";
        return t === key || t === DOCK_TYPE || t.indexOf(name) >= 0;
      }) || null
    );
  }

  /* 面板是否真的开出来了：两个条件缺一不可
       ① .mist-dock 存在  —— 面板内容建出来了（init 没抛错）。
          0.2.2/0.2.3 的毛病就出在这：init 一抛错内容压根没建，图标却照样
          变激活，于是既不显示面板、也不弹兜底窗 →「点了没反应」。
       ② 图标是激活态，或者面板占到地方了。
          只看 rect 会在「窗口被遮挡、宽度过渡没推进」时误判成没开，白白弹窗。 */
  isPanelShown() {
    const panel = document.querySelector(".mist-dock");
    if (!panel) return false;
    const item = this.findDockItem();
    const active =
      !!item &&
      (item.classList.contains("dock__item--active") ||
        item.classList.contains("dock__item--activefocus"));
    if (active) return true;
    const r = panel.getBoundingClientRect();
    return r.width > 40 && r.height > 40;
  }

  /* 派发三连事件，走思源原生的 mousedown 监听器（见 openSettings 注释） */
  fireDockToggle(item) {
    const opt = { bubbles: true, cancelable: true, view: window, button: 0 };
    item.dispatchEvent(new MouseEvent("mousedown", opt));
    item.dispatchEvent(new MouseEvent("mouseup", opt));
    item.dispatchEvent(new MouseEvent("click", opt));
  }

  /* 关闭侧栏面板 = 再点一次右缘图标（思源的停靠项就是这么开关的）。
     面板里的 × 按钮走这里；找不到停靠项时什么都不做，不能把弹窗也一起关掉
     （弹窗有自己的 ×，见 openDialog）。 */
  closeDockPanel() {
    const item = this.findDockItem();
    if (!item) return;
    if (!this.isPanelShown()) return;
    this.fireDockToggle(item);
  }

  /* 面板本来就在：把控件按当前状态刷一遍（可能在别处改过设置） */
  refreshDock() {
    if (this._dockRoot && document.contains(this._dockRoot)) {
      this.editMode = this.modeKey();
      this.syncControls(this._dockRoot);
      this.renderThumb(this._dockRoot);
      /* 面板是常驻的：明暗模式可能在面板开着时被切走，提示要跟着变 */
      this.refreshModeHint(this._dockRoot);
      this.renderStatus(this._dockRoot);
    }
  }

  /* ---------------- 样式 ---------------- */

  /* ---------------- 浮动面板 · 玻璃外壳 + 弹出动画（0.2.9）----------------
     规则动态生成（每次 apply 重建 style 标签），变量只留 --mist-float-dur / -ease，
     这样拖滑块改时长/缓动不用重建 CSS。 */
  floatCss() {
    const f = this.state.float || {};
    if (!f.enable) return [];
    const P = `html[${FLAG_ATTR}]`;
    const num = (v, min, max, def) => Math.max(min, Math.min(max, Number(v) !== Number(v) ? def : Number(v)));
    const radius = num(f.radius, 0, 32, 16);
    const blur = num(f.blur, 0, 40, 18);
    const sat = num(f.sat, 100, 220, 170);
    const alpha = (num(f.alpha, 5, 100, 62) / 100).toFixed(2);
    const sh = num(f.shadow, 0, 60, 16) / 100;
    const gap = num(f.gap, 0, 28, 8);
    /* 左边留白最多 6px：原生收起位移写死 -247px，余量只有 7px，
       再多收起时右缘就露出一条。 */
    const leftGap = Math.min(gap, 6);
    const filter = `blur(${blur}px) saturate(${sat}%)`;
    const out = [
      `${P} .layout--float{top:calc(112px + ${gap}px);bottom:calc(82px + ${gap}px);translate:${leftGap}px 0;}`,
      `${P}:not([data-theme-mode="dark"]) .layout--float{background:rgba(255,255,255,${alpha}) !important;}`,
      `${P}[data-theme-mode="dark"] .layout--float{background:rgba(34,38,46,${alpha}) !important;}`,
      `${P} .layout--float{`,
      `  border-radius:${radius}px !important;`,
      `  overflow:hidden !important;`,
      `  backdrop-filter:${filter} !important;`,
      `  -webkit-backdrop-filter:${filter} !important;`,
      `  box-shadow:0 ${(sh * 40).toFixed(1)}px ${(sh * 180).toFixed(1)}px rgba(31,38,135,${(sh * 0.55).toFixed(3)}),`,
      `             0 2px 8px rgba(0,0,0,${(sh * 0.22).toFixed(3)}),`,
      `             inset 0 1px 0 rgba(255,255,255,.7) !important;`,
      /* 接管原生 .2s/.3s：收起的手感也跟着这里的时长/缓动走 */
      `  transition:transform var(--mist-float-dur,300ms) var(--mist-float-ease,cubic-bezier(.16,1,.3,1)),`,
      `             opacity var(--mist-float-dur,300ms) var(--mist-float-ease,cubic-bezier(.16,1,.3,1)) !important;`,
      `}`,
    ];
    /* 磨砂颗粒：一层 SVG noise，纯 blur 是"雾"，加了颗粒才是"磨砂" */
    if (f.grain) {
      out.push(
        `${P} .layout--float::before{`,
        `  content:"";position:absolute;inset:0;z-index:0;pointer-events:none;border-radius:inherit;`,
        `  opacity:.5;background-image:url("data:image/svg+xml,${GRAIN_SVG}");`,
        `}`
      );
    }
    /* 内容层抬到颗粒之上（::before 是定位元素，默认会盖住静态内容） */
    out.push(`${P} .layout--float > .fn__flex-1.fn__flex{position:relative;z-index:1;}`);

    const a = f.anim || "none";
    if (a === "none") return out;
    /* 外壳类动画：用 backwards 不用 both —— 结束后不能残留，
       否则会一直盖住思源写进 inline 的 opacity/transform，面板收不回去。 */
    if (a === "fade" || a === "veil") {
      if (a === "fade") {
        out.push(`@keyframes mist-fshell-fade{0%{opacity:0}100%{opacity:1}}`);
      } else {
        const thick = `blur(${Math.min(40, blur + 16)}px) saturate(${sat}%)`;
        out.push(
          `@keyframes mist-fshell-veil{`,
          `  0%{opacity:0;clip-path:inset(0 100% 0 0);backdrop-filter:${thick};-webkit-backdrop-filter:${thick}}`,
          `  55%{opacity:1}`,
          `  100%{opacity:1;clip-path:inset(0 0 0 0);backdrop-filter:${filter};-webkit-backdrop-filter:${filter}}`,
          `}`
        );
      }
      out.push(`${P} .layout--float.mist-float-pop{animation:mist-fshell-${a} var(--mist-float-dur,300ms) var(--mist-float-ease,cubic-bezier(.16,1,.3,1)) backwards;}`);
      return out;
    }
    /* 内容层类动画：这层没有 inline transform，可以放心用 both */
    const kf = {
      push: `0%{opacity:0;transform:translateX(-14px)}100%{opacity:1;transform:translateX(0)}`,
      scale: `0%{opacity:0;transform:scale(.94)}100%{opacity:1;transform:scale(1)}`,
      spring: `0%{opacity:0;transform:translateX(-18px) scale(.97)}55%{opacity:1}72%{transform:translateX(4px) scale(1.006)}100%{opacity:1;transform:translateX(0) scale(1)}`,
    }[a];
    if (!kf) return out;
    out.push(`@keyframes mist-fpop-${a}{${kf}}`);
    out.push(
      `${P} .layout--float > .fn__flex-1.fn__flex.mist-float-pop{`,
      `  animation:mist-fpop-${a} var(--mist-float-dur,300ms) var(--mist-float-ease,cubic-bezier(.16,1,.3,1)) both;`,
      `  transform-origin:left center;`,
      `}`
    );
    return out;
  }

  /* ---------------- 标题栏图钉（0.2.10）----------------
     为什么要有它：浮动布局的面板是「鼠标一离开就收起」的。你想在右边的设置
     面板里拖滑块，鼠标刚挪开左边的文档树，面板就缩回去了 —— 手在这边、眼睛
     在那边，根本没法比对。这个图钉就是把这个麻烦钉住：
        钉住 = 把**这一次浮出来的状态锁在这儿**。布局依然是浮动（玻璃外观、
               圆角、动画全都在），只是不再跟着鼠标自动收回；
        松钉 = 恢复原样，移开即收。
     ‼ 它不是把浮动布局切成固定布局 —— 那是思源自己的 pin（切了布局，玻璃
       整套效果随之消失）。这里要的是「临时停在这」，所以不改 dock.pin。

     实现的关键事实：思源收起面板 = 改 inline style 的 transform（推回负位移）
     + opacity 归 0。inline 里的普通值压不过作者样式表里的 !important，所以
     锁定期间在 <html> 上打个属性，让 CSS 用 !important 把这两个值钉在展开时
     的数值上。不轮询、不拦事件、不改 DOM：思源照写它的 inline，只是不生效。
     展开值从点击那一刻的 inline transform 里读（这一刻面板必然是展开的），
     不写死 34px —— 那个数是图标栏宽度，响应式布局下会变。

     控件本体沿用原生 class（block__icon ariaLabel），hover 提示/尺寸/间距
     全部跟原生一致；只额外用旋转和配色表达「钉没钉住」。图标直接用页面自带
     的 #iconPin，不打包任何资源。 */
  pinTag() {
    return (
      '<span class="block__icon ariaLabel mist-pin" data-position="north" data-mist-pinned="0">' +
      '<svg><use xlink:href="#iconPin"></use></svg></span>'
    );
  }

  /* 面板可能异步出现（插件面板、切出来的 tab），所以轮询补注入 ——
     和 watchFloatDock 一样不用 MutationObserver：文档树一滚动就刷出成百上千
     条 childList 记录，为一个按钮不值当。500ms 一次，代价约等于两次
     querySelectorAll。顺带在这里做「浮动没了就自动松钉」，避免幽灵锁定。 */
  watchPinButtons() {
    this.unwatchPinButtons();
    if (!this.isMist()) return;
    this.injectPinButtons();
    this._pinTimer = setInterval(() => this.injectPinButtons(), 500);
  }

  unwatchPinButtons() {
    if (this._pinTimer) {
      clearInterval(this._pinTimer);
      this._pinTimer = 0;
    }
  }

  injectPinButtons() {
    const f = this.state.float || {};
    if (!this.isMist() || !f.pinBtn) {
      this.removePinButtons();
      this.releaseAllLocks();
      return;
    }
    /* 浮动状态变了（比如被思源自己的图钉切成固定）就把锁放掉，
       否则那个 !important 会一直压着。 */
    ["l", "r"].forEach((s) => {
      if (!document.querySelector(s === "l" ? ".layout__dockl.layout--float" : ".layout__dockr.layout--float")) {
        this.releaseLock(s);
      }
    });
    document.querySelectorAll("#layouts .block__icons").forEach((head) => {
      const has = head.querySelector(":scope > .mist-pin");
      /* 只给浮动面板注入：固定布局下面板本来就是常驻的，钉它没意义 */
      if (!head.closest(".layout--float")) {
        if (has) has.remove();
        return;
      }
      if (has) return;
      /* 薄雾自己的设置面板不加：它右上角已经有 ×，再塞图钉会撞车 */
      if (head.querySelector(".mist-nav")) return;
      head.insertAdjacentHTML("beforeend", this.pinTag());
    });
    this.syncPinButtons();
  }

  /* 每次注入后重刷一遍按钮状态（锁可能在别处被放掉） */
  syncPinButtons() {
    const root = document.documentElement;
    document.querySelectorAll("#layouts .mist-pin").forEach((btn) => {
      const on = root.hasAttribute("data-mist-lock-" + this.pinSide(btn));
      btn.setAttribute("data-mist-pinned", on ? "1" : "0");
      btn.setAttribute(
        "aria-label",
        on ? "松钉（鼠标移开后面板照常收起）" : "钉住面板（这一次先别收起）"
      );
    });
  }

  pinSide(el) {
    return el.closest(".layout__dockl") ? "l" : "r";
  }

  removePinButtons() {
    document.querySelectorAll("#layouts .mist-pin").forEach((el) => el.remove());
  }

  /* 展开位移 = 把面板推到图标栏的右边那一格。
     ⚠ 不要去读 el.style.transform 当现成值 —— 那是「此刻」的位移，若此刻刚好
       是收起态（translateX(-278px)），照抄就等于把面板锁在屏幕外（踩过一次）。
       展开位移恒等于图标栏宽度（实测 34px = 收起 -278px 减去面板宽 270 与
       余量），按图标栏实际宽度算出来才是稳的；右侧方向相反。
     宽度随时会变：响应式布局会收窄图标栏，所以每次锁定时现读。 */
  openShift(side) {
    const bar = side === "l" ? document.getElementById("dockLeft") : document.getElementById("dockRight");
    const w = (bar && bar.offsetWidth) || 34;
    return "translateX(" + (side === "l" ? w : -w) + "px)";
  }

  toggleFloatLock(btn) {
    const side = this.pinSide(btn);
    const root = document.documentElement;
    if (root.hasAttribute("data-mist-lock-" + side)) this.releaseLock(side);
    else this.lockDock(side);
    this.syncPinButtons();
  }

  lockDock(side) {
    const root = document.documentElement;
    /* ⚠ 只碰自己的 --mist-float-lock-*：用户设置的四个 --mist-* 也写在同一个
       style 上，千万别顺手 removeProperty 别的名字（踩过，会把设置擦掉）。 */
    root.style.setProperty("--mist-float-lock-" + side, this.openShift(side));
    root.setAttribute("data-mist-lock-" + side, "1");
  }

  releaseLock(side) {
    const root = document.documentElement;
    root.removeAttribute("data-mist-lock-" + side);
    root.style.removeProperty("--mist-float-lock-" + side);
  }

  releaseAllLocks() {
    ["l", "r"].forEach((s) => this.releaseLock(s));
  }

  /* 图钉按钮的观感：没钉住时歪着放 + 半透明，像随手别在那儿；
     钉住了立正 + 主题色，一眼看得出是锁着的。 */
  pinCss() {
    const P = `html[${FLAG_ATTR}]`;
    return [
      `${P} .mist-pin{opacity:.48;transform:rotate(45deg);transition:opacity .15s,transform .2s,color .15s;}`,
      `${P} .mist-pin:hover{opacity:1;}`,
      /* 没钉住时跟着原生节奏走（鼠标移到标题栏才浮现，和定位/折叠那一排一致）；
         钉住之后必须常显 —— 面板已经常驻了，图标却随鼠标走，用户会因为找不到
         松钉的入口而把它当成卡死。 */
      `${P} .mist-pin[data-mist-pinned="1"]{opacity:1;transform:none;color:var(--b3-theme-primary);display:inline-flex !important;}`,
      /* 锁定期间把展开态钉死：这里的 !important 就是全部的机关，
         思源写进 inline 的收起值压不住它。 */
      `${P}[data-mist-lock-l="1"] .layout__dockl.layout--float{`,
      `  transform:var(--mist-float-lock-l,translateX(34px)) !important;`,
      `  opacity:1 !important;pointer-events:auto !important;`,
      `}`,
      `${P}[data-mist-lock-r="1"] .layout__dockr.layout--float{`,
      `  transform:var(--mist-float-lock-r,translateX(-34px)) !important;`,
      `  opacity:1 !important;pointer-events:auto !important;`,
      `}`,
    ];
  }

  ensureStyle(force) {
    let el = document.getElementById(STYLE_ID);
    if (el) {
      if (!force) return el;
      /* force = 数值变了要重算规则。**必须先把旧的摘掉** —— 直接
         createElement 会 append 出第二个同 id 的标签，而 getElementById
         永远取第一个，于是新规则一直不生效（0.2.9 首版踩过）。 */
      el.remove();
    }
    el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = [
      /* 背景图的作用范围与铺法。主题里的 body 规则硬编码了 cover/no-repeat，
         这里用更高特异性 + 变量接管，避免改主题。 */
      `html[${FLAG_ATTR}] body{`,
      `  background-size:var(--mist-bg-size,cover) !important;`,
      `  background-repeat:var(--mist-bg-repeat,no-repeat) !important;`,
      `  background-position:var(--mist-bg-pos,center) !important;`,
      `  background-attachment:fixed !important;`,
      `}`,
      /* 仅编辑区：全窗口不铺图，图改铺在编辑区容器里 */
      `html[${FLAG_ATTR}][data-mist-scope="editor"] body{background-image:none !important;}`,
      `html[${FLAG_ATTR}][data-mist-scope="editor"] #layouts .layout__center{`,
      `  background-image:var(--mist-bg-image,none) !important;`,
      `  background-size:var(--mist-bg-size,cover) !important;`,
      `  background-repeat:var(--mist-bg-repeat,no-repeat) !important;`,
      `  background-position:var(--mist-bg-pos,center) !important;`,
      `}`,
      /* 暗色下压暗背景图：浅色图衬浅色字会糊成一片。
         用 background-blend-mode 与底色混合，比 filter 安全（filter 会连带
         压暗所有子元素，把正文也一起吃掉）。 */
      `html[${FLAG_ATTR}][data-theme-mode="dark"] body{`,
      `  background-color:#1c1e22 !important;`,
      `  background-blend-mode:multiply;`,
      `}`,
      ...this.floatCss(),
      ...this.pinCss(),
      ...this.dialogCss(),
      ...this.mobileSidebarCss(),
    ].join("\n");
    document.head.appendChild(el);
    return el;
  }

  dialogCss() {
    return [
      `.mist-dlg{display:flex;height:100%;min-height:480px;}`,
      `.mist-dlg *{box-sizing:border-box;}`,
      `.mist-nav{width:132px;flex:0 0 132px;padding:8px 6px;border-right:1px solid var(--b3-border-color);overflow:auto;}`,
      `.mist-nav button{display:block;width:100%;text-align:left;padding:6px 10px;margin-bottom:2px;border:0;border-radius:var(--b3-border-radius);background:transparent;color:var(--b3-theme-on-surface);font-size:13px;cursor:pointer;line-height:1.6;}`,
      `.mist-nav button:hover{background:var(--b3-list-hover);}`,
      `.mist-nav button.on{background:var(--b3-theme-primary-lightest,var(--b3-list-hover));color:var(--b3-theme-primary);}`,
      `.mist-main{flex:1;min-width:0;overflow:auto;padding:14px 20px 24px;}`,
      `.mist-pane{display:none;}`,
      `.mist-pane.on{display:block;}`,
      `.mist-grp{font-size:12px;color:var(--b3-theme-on-surface);letter-spacing:.4px;margin:16px 0 8px;font-weight:500;}`,
      `.mist-grp:first-child{margin-top:0;}`,
      `.mist-row{display:flex;align-items:center;gap:12px;padding:8px 0;min-height:34px;}`,
      `.mist-row .mist-lb{flex:0 0 106px;font-size:13px;color:var(--b3-theme-on-background);}`,
      `.mist-row .mist-ctl{flex:1;min-width:0;display:flex;align-items:center;gap:8px;}`,
      `.mist-hint{font-size:12px;color:var(--b3-theme-on-surface);line-height:1.65;margin:4px 0 12px;}`,
      `.mist-sep{height:1px;background:var(--b3-border-color);margin:14px 0;}`,
      `.mist-mode{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;align-items:center;}`,
      `.mist-mode button{padding:3px 14px;border-radius:12px;border:1px solid var(--b3-border-color);background:transparent;color:var(--b3-theme-on-surface);font-size:12px;cursor:pointer;line-height:1.8;}`,
      `.mist-mode button.on{background:var(--b3-theme-primary);border-color:var(--b3-theme-primary);color:#fff;}`,
      /* 0.2.20 明暗提示：正在编辑的那一套 ≠ 当前界面时必须说清楚，
         否则「拖了滑块没反应」会被当成主题坏了。 */
      `.mist-mode-hint{margin:0 0 0 auto;font-size:11px;line-height:1.55;color:var(--b3-theme-on-surface-light);}`,
      `.mist-mode-hint b{font-weight:600;color:var(--b3-theme-on-surface);}`,
      `.mist-mode-hint.warn{color:#b4681c;}`,
      `html[data-theme-mode="dark"] .mist-mode-hint.warn{color:#e3a558;}`,
      /* 侧栏停靠面板只有 300px 宽：提示独占一行 */
      `.mist-dock .mist-mode-hint{flex:1 0 100%;margin:2px 0 0;}`,
      `html[data-mist-mobile] .mist-mode-hint{flex:1 0 100%;margin:6px 0 0;font-size:12px;}`,
      `.mist-range{flex:1;min-width:0;}`,
      `.mist-num{width:52px;flex:0 0 52px;text-align:right;font-size:12px;color:var(--b3-theme-on-surface);font-variant-numeric:tabular-nums;}`,
      `.mist-sw{width:26px;height:26px;flex:0 0 26px;display:inline-block;border:1px solid var(--b3-border-color);border-radius:6px;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.09);}`,
      `.mist-sw.on{border-color:var(--b3-theme-primary);box-shadow:inset 0 0 0 1px rgba(0,0,0,.09),0 0 0 2px var(--b3-theme-primary-lightest,rgba(0,122,255,.22));}`,

      /* ---- 自绘取色器 ----
         原来点色块调的是 input[type=color]。Electron 里那会拉起**系统取色面板**：
         位置钉在窗口左上角、压住文档树，而且拖不动 —— 鼠标在右边点，眼睛得跑
         到左边看。这里改成原地展开，跟着行往下走。 */
      `.mist-cp{display:none;padding:9px;margin:2px 0 10px;border:1px solid var(--b3-border-color);border-radius:8px;background:var(--b3-theme-surface);}`,
      `.mist-cp.on{display:block;}`,
      `.mist-cp-sv{position:relative;height:104px;border-radius:6px;cursor:crosshair;touch-action:none;background:linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,#f00);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);}`,
      `.mist-cp-dot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.45),0 1px 3px rgba(0,0,0,.3);pointer-events:none;}`,
      `.mist-cp-hue{position:relative;height:12px;margin:11px 0;border-radius:6px;cursor:pointer;touch-action:none;background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);}`,
      `.mist-cp-hdot{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;border:1px solid rgba(0,0,0,.3);box-shadow:0 1px 2px rgba(0,0,0,.35);pointer-events:none;}`,
      `.mist-cp-foot{display:flex;align-items:center;gap:6px;}`,
      `.mist-cp-prev{width:26px;height:26px;flex:0 0 26px;border-radius:6px;border:1px solid var(--b3-border-color);}`,
      `.mist-cp-hex{flex:1;min-width:0;height:26px;font-size:12px;text-transform:uppercase;font-variant-numeric:tabular-nums;}`,
      `.mist-cp-foot .mist-btn{padding:2px 8px;line-height:1.7;}`,
      `.mist-dock .mist-cp-sv{height:92px;}`,
      `.mist-preset{padding:3px 13px;border-radius:12px;border:1px solid var(--b3-border-color);background:transparent;color:var(--b3-theme-on-surface);font-size:12px;cursor:pointer;line-height:1.8;}`,
      `.mist-preset:hover{border-color:var(--b3-theme-primary);color:var(--b3-theme-primary);}`,
      `.mist-preset.on{border-color:var(--b3-theme-primary);color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest,rgba(0,122,255,.1));}`,
      `select[data-k]{width:auto;min-width:230px;}`,
      `.mist-thumb{width:100%;height:88px;border-radius:8px;border:1px solid var(--b3-border-color);background-size:cover;background-position:center;margin-bottom:8px;}`,
      `.mist-scenes{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px;margin-bottom:6px;}`,
      `.mist-scene{position:relative;border:1px solid var(--b3-border-color);border-radius:10px;overflow:hidden;cursor:pointer;aspect-ratio:16/10;background-size:cover;background-position:center;transition:border-color .15s ease;}`,
      `.mist-scene:hover{border-color:var(--b3-theme-primary);}`,
      `.mist-scene.on{border-color:var(--b3-theme-primary);box-shadow:0 0 0 2px var(--b3-theme-primary-lightest,rgba(0,122,255,.22));}`,
      `.mist-scene .lb{position:absolute;left:0;right:0;bottom:0;font-size:11px;color:#fff;text-align:center;padding:2px 0;background:linear-gradient(transparent,rgba(0,0,0,.55));text-shadow:0 1px 2px rgba(0,0,0,.6);}`,
      `.mist-scene .grp{position:absolute;top:4px;left:5px;font-size:10px;color:#fff;background:rgba(0,0,0,.4);border-radius:6px;padding:0 5px;}`,
      `.mist-btn{padding:4px 12px;border-radius:var(--b3-border-radius);border:1px solid var(--b3-border-color);background:var(--b3-theme-surface);color:var(--b3-theme-on-surface);font-size:12px;cursor:pointer;line-height:1.9;}`,
      `.mist-btn:hover{border-color:var(--b3-theme-primary);color:var(--b3-theme-primary);}`,
      `.mist-btn.primary{background:var(--b3-theme-primary);border-color:var(--b3-theme-primary);color:#fff;}`,
      `.mist-icon-cur{display:flex;align-items:center;gap:8px;}`,
      `.mist-icon-cur svg{width:18px;height:18px;}`,
      `.mist-icon-cur code{font-size:12px;color:var(--b3-theme-on-surface);}`,
      `.mist-picker{display:none;border:1px solid var(--b3-border-color);border-radius:8px;padding:8px;margin:2px 0 10px;}`,
      `.mist-picker.on{display:block;}`,
      `.mist-picker-top{display:flex;align-items:center;gap:8px;margin-bottom:6px;}`,
      `.mist-picker-top input{flex:1;min-width:0;}`,
      `.mist-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:3px;max-height:168px;overflow:auto;padding-right:2px;}`,
      `.mist-grid .cell{height:26px;display:flex;align-items:center;justify-content:center;border-radius:5px;border:1px solid transparent;cursor:pointer;color:var(--b3-theme-on-surface);}`,
      `.mist-grid .cell:hover{background:var(--b3-list-hover);}`,
      `.mist-grid .cell.on{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest,var(--b3-list-hover));color:var(--b3-theme-primary);}`,
      `.mist-grid .cell svg{width:15px;height:15px;}`,

      /* ---- 本机字体列表（0.2.11）----
         原来字体框挂 <datalist>：名单是写死的（不是本机实况），而且 Electron
         那个原生下拉在 348px 侧栏里会被裁一截、也滚不利索。改成自己的列表：
         限高 + overflow-y:auto，本机装了多少都能滚着看；每行的名字用该字体
         自身渲染，旁边一个「永」字（永字八法，中文字形最全的样本）看效果。 */
      `.mist-fontpick{display:none;border:1px solid var(--b3-border-color);border-radius:8px;padding:8px;margin:6px 0 10px;}`,
      `.mist-fontpick.on{display:block;}`,
      `.mist-fontlist{max-height:min(260px,46vh);overflow-y:auto;overscroll-behavior:contain;padding-right:2px;}`,
      `.mist-fontlist::-webkit-scrollbar{width:6px;}`,
      `.mist-fontlist::-webkit-scrollbar-thumb{background:rgba(120,130,145,.4);border-radius:6px;}`,
      `.mist-fontlist::-webkit-scrollbar-thumb:hover{background:rgba(120,130,145,.6);}`,,
      `.mist-fontlist .fi{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 9px;border-radius:6px;border:1px solid transparent;cursor:pointer;color:var(--b3-theme-on-surface);line-height:1.7;}`,
      `.mist-fontlist .fi:hover{background:var(--b3-list-hover);}`,
      `.mist-fontlist .fi.on{border-color:var(--b3-theme-primary);background:var(--b3-theme-primary-lightest,var(--b3-list-hover));color:var(--b3-theme-primary);}`,
      `.mist-fontlist .fi .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;}`,
      `.mist-fontlist .fi .pv{flex:0 0 auto;font-size:15px;opacity:.6;}`,
      `.mist-fontlist .fi.on .pv{opacity:.85;}`,
      `.mist-empty{font-size:12px;color:var(--b3-theme-on-surface);padding:12px 0;}`,
      `.mist-about{font-size:12.5px;color:var(--b3-theme-on-surface);line-height:1.9;}`,
      `.mist-about b{color:var(--b3-theme-on-background);font-weight:500;}`,
      `.mist-tag{display:inline-block;padding:0 7px;border-radius:9px;font-size:11px;line-height:19px;background:var(--b3-theme-success,#5cb85c);color:#fff;}`,
      `.mist-tag.warn{background:var(--b3-theme-error,#d9534f);}`,

      /* ---- 右侧停靠面板：同一套 DOM，窄栏改成「顶部横排 tab + 内容竖排」。

         弹窗版是左侧竖导航（132px）+ 右侧内容，用在 348px 的侧栏里会只剩
         216px 给控件，滑块和下拉都挤成一条。所以这里只做布局重排：
           · .mist-dlg 由横排改竖排，导航条变横向可滚动的 tab
           · 标签列收窄到 72px，下拉改成 100% 宽（模板里写了 width:180px
             行内样式，必须 !important 才盖得住）
           · 图标格子从 12 列降到 8 列，避免每个格子小到点不准 */
      `.mist-dock{flex:1;min-height:0;height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--b3-theme-background);position:relative;}`,

      /* ---- 面板右上角的关闭按钮 ----
         侧栏面板不像弹窗那样自带 ×，只能靠「再点一次右缘图标」关掉；
         而那个图标平时是 14px 半透明细条里的形状，找不到就等于关不掉。
         这里补一个真正的关闭入口：点一下 = 派发停靠项的三连事件（等同再点图标）。
         弹窗版本不显示（弹窗自带 ×，多一个会撞车）。 */
      `.mist-close{display:none;position:absolute;top:6px;right:8px;width:26px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--b3-theme-on-surface);cursor:pointer;align-items:center;justify-content:center;z-index:3;}`,
      `.mist-close svg{width:14px;height:14px;}`,
      `.mist-close:hover{background:var(--b3-list-hover);color:var(--b3-theme-on-background);}`,
      `.mist-dock .mist-close{display:flex;}`,
      `.mist-dock .mist-dlg{flex:1;min-height:0;height:auto;flex-direction:column;}`,
      `.mist-dock .mist-nav{display:flex;flex:0 0 auto;flex-wrap:wrap;width:auto;gap:2px;padding:7px 40px 4px 8px;border-right:0;border-bottom:1px solid var(--b3-border-color);white-space:nowrap;overflow:visible;scrollbar-width:none;}`,
      `.mist-dock .mist-nav button{width:auto;flex:0 0 auto;padding:5px 9px;margin:0 2px 0 0;white-space:nowrap;border-radius:6px;}`,
      `.mist-dock .mist-main{flex:1;min-height:0;padding:12px 14px 24px;}`,
      `.mist-dock .mist-row{gap:10px;}`,
      `.mist-dock .mist-row .mist-ctl{flex-wrap:wrap;}`,
      `.mist-dock .mist-preset{flex:0 0 auto;white-space:nowrap;padding:3px 9px;margin-right:0 !important;}`,
      /* 0.2.27：预设从 4 套变 5 套（多了「仿 wolai」），348px 侧栏一行放不下，
         必须允许换行，否则最后一个按钮被裁掉。 */
      `#mistPresets{flex-wrap:wrap;row-gap:6px;}`,
      `#mistPresets .mist-preset{margin-right:0 !important;}`,
      `.mist-dock .mist-row .mist-lb{flex:0 0 72px;font-size:12.5px;}`,
      `.mist-dock .mist-num{width:44px;flex:0 0 44px;}`,
      `.mist-dock select[data-k]{min-width:0;width:100% !important;}`,
      `.mist-dock .mist-grid{grid-template-columns:repeat(8,1fr);}`,
      `.mist-dock .mist-thumb{height:66px;}`,
      `.mist-dock .mist-mode{margin-bottom:10px;}`,
      /* 窄栏里这句解释性文字挤掉的宽度比它值钱，直接收掉；按钮高亮已经说明在编辑哪一套 */
      `.mist-dock .mist-mode .mist-hint{display:none;}`,
      `.mist-dock .mist-about code{word-break:break-all;}`,
      /* ---- 手机端设置页（0.2.19）----
         思源手机端打开的 Dialog 基本是全屏。桌面那套「132px 左竖导航 + 右内容」
         在手机上直接崩：<nav> 没有可用宽度 → <button> 按 inline 排成两行、
         标签和滑块叠在一起，就是「有些乱」的样子。
         这里只做重排，配色沿用思源变量：
           · 导航横排成可滚动的胶囊 tab
           · 标签独占一行、控件另起一行（手机窄，横排一定挤）
           · 滑块拉高到 28px，手指好按；数值框固定宽度不被压扁 */
      `html[data-mist-mobile] .mist-dlg{flex-direction:column;height:100%;min-height:0;}`,
      `html[data-mist-mobile] .mist-nav{display:flex;flex:0 0 auto;width:auto;gap:6px;padding:10px 12px 9px;` +
        `border-right:0;border-bottom:1px solid var(--b3-border-color);overflow-x:auto;overflow-y:hidden;` +
        `-webkit-overflow-scrolling:touch;scrollbar-width:none;}`,
      `html[data-mist-mobile] .mist-nav::-webkit-scrollbar{display:none;}`,
      `html[data-mist-mobile] .mist-nav button{width:auto;flex:0 0 auto;white-space:nowrap;padding:7px 14px;` +
        `margin:0;border-radius:14px;font-size:13.5px;background:var(--b3-list-hover);line-height:1.5;}`,
      `html[data-mist-mobile] .mist-nav button.on{background:var(--b3-theme-primary);color:#fff;}`,
      `html[data-mist-mobile] .mist-main{flex:1;min-height:0;padding:14px 14px calc(30px + env(safe-area-inset-bottom,0px));}`,
      `html[data-mist-mobile] .mist-row{flex-wrap:wrap;align-items:flex-start;gap:8px 10px;padding:10px 0;}`,
      `html[data-mist-mobile] .mist-row .mist-lb{flex:0 0 100%;font-size:13.5px;}`,
      `html[data-mist-mobile] .mist-row .mist-ctl{flex:1 1 100%;flex-wrap:wrap;gap:8px;}`,
      `html[data-mist-mobile] .mist-ctl .mist-range{flex:1 1 auto;min-width:140px;height:28px;}`,
      `html[data-mist-mobile] .mist-ctl .mist-num{width:54px;flex:0 0 54px;font-size:13px;}`,
      `html[data-mist-mobile] select[data-k]{min-width:0;width:100% !important;}`,
      `html[data-mist-mobile] .mist-mode button{padding:6px 18px;font-size:13px;}`,
      `html[data-mist-mobile] .mist-preset{padding:6px 15px;font-size:13px;}`,
      `html[data-mist-mobile] .mist-btn{padding:8px 16px;font-size:13px;}`,
      `html[data-mist-mobile] .mist-scenes{grid-template-columns:repeat(3,1fr);gap:8px;}`,
      `html[data-mist-mobile] .mist-thumb{height:110px;}`,
      `html[data-mist-mobile] .mist-grid{grid-template-columns:repeat(8,1fr);gap:4px;}`,
      `html[data-mist-mobile] .mist-grid .cell{height:34px;}`,
      `html[data-mist-mobile] .mist-cp-sv{height:150px;}`,
      `html[data-mist-mobile] .mist-cp-hue{height:16px;margin:14px 0;}`,
      `html[data-mist-mobile] .mist-cp-foot{flex-wrap:wrap;}`,
      `html[data-mist-mobile] .mist-fontlist{max-height:44vh;}`,
      `html[data-mist-mobile] .mist-grp{margin:18px 0 10px;font-size:12.5px;}`,
      `html[data-mist-mobile] .mist-hint{font-size:12.5px;}`,
    ];
  }

  /* ---------------- 应用 / 撤销 ---------------- */

  /* ================= 思维导图配色（0.2.24）================= */

  msbMmInit() {
    /* 手机端不做：手机上本来就不套薄雾，导图保持思源默认 */
    if (this._mobileOnly) return;
    if (this.state.mindmap && this.state.mindmap.enable === false) {
      this.msbMmStop();
      return;
    }
    this._mmOn = true;
    this.msbMmHookCanvas();
    if (!this._mmBodyOb) {
      this._mmBodyOb = new MutationObserver(() => this.msbMmSchedule());
      /* body 只盯 childList（导图容器出现 / 块被重建）。每个容器自己再挂一个
         只盯 style 的 observer —— 别把 style 的变化放在 body 级，
         思源每敲一个字都在改 style，那样每帧都要全文档扫一遍。 */
      this._mmBodyOb.observe(document.body, { childList: true, subtree: true });
    }
    this.msbMmPaint();
  }

  msbMmSchedule() {
    if (this._mmTimer) return;
    /* ❗这里用 setTimeout 而不是 requestAnimationFrame：
       rAF 在页面不可见（headless / 窗口最小化 / 切到后台标签）时会直接停摆，
       导图一旦在那种状态下被思源重算过颜色，回来就是一屏旧配色。
       setTimeout 在后台会被节流到 1s，但至少还会跑。 */
    this._mmTimer = setTimeout(() => {
      this._mmTimer = 0;
      this.msbMmPaint();
    }, 16);
  }

  msbMmPaint() {
    if (!this._mmOn) return;
    const mode = this.isDark() ? "dark" : "light";
    const views = document.querySelectorAll(".mindmap-view");
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      if (!view.__mistMmOb) {
        const ob = new MutationObserver(() => this.msbMmSchedule());
        ob.observe(view, { subtree: true, attributes: true, attributeFilter: ["style"] });
        view.__mistMmOb = ob;
      }
      const nodes = view.querySelectorAll(".mindmap-view__node");
      for (let j = 0; j < nodes.length; j++) {
        this.msbMmToneNode(nodes[j], mode);
      }
    }
  }

  /* 单个节点：思源写进 inline 的是「原色」，这里换成它自己的淡一档版本。
     · mistMmSrc  记原色 —— 切明暗后要靠它重算，不能拿已被我改过的值当原色；
     · mistMmOut  记我写出去的值，读回来一致就说明还是我的，直接跳过 ——
       这是防死循环的唯一保障（比较走 mmSame，不看字符串格式）。
     · mistMmMode 记上次用的是哪套参数 —— 少了它就切不到暗色：
       切暗色后 cur 与 out 仍然相等，会被「值相等」那道门直接放走。 */
  msbMmToneNode(el, mode) {
    const cur = el.style.backgroundColor || "";
    const src = el.dataset.mistMmSrc || "";
    const out = el.dataset.mistMmOut || "";
    if (el.dataset.mistMmMode === mode && out && mmSame(cur, out)) return;

    /* 原色基准：inline 里已经不是「我的输出」了，说明思源（或用户）刚改过，
       当前值就是新的原色；否则沿用上次记下的原色。 */
    const base = !out || !mmSame(cur, out) ? cur : src;

    const bg = mmSoften(base, mode, "bg");
    if (!bg) {
      /* 无底色节点（叶子）：只把它的彩字调柔，绝不强行补一块底色 ——
         补了整张图就变成一堆色块，那正是 0.2.24 被否掉的原因。 */
      this.msbMmToneLeaf(el, mode);
      delete el.dataset.mistMmOut;
      delete el.dataset.mistMmSrc;
      delete el.dataset.mistMmSrcFg;
      el.dataset.mistMmMode = mode;
      return;
    }
    if (!el.dataset.mistMmSrcFg) el.dataset.mistMmSrcFg = el.style.color || "";
    const fg = mmSoften(base, mode, "fg");
    if (!mmSame(cur, bg)) el.style.backgroundColor = bg;
    if (fg) {
      if (!mmSame(el.style.color, fg)) el.style.color = fg;
      if (el.style.getPropertyValue("--mindmap-node-text-color") !== fg) {
        el.style.setProperty("--mindmap-node-text-color", fg);
      }
    }
    el.dataset.mistMmSrc = base;
    el.dataset.mistMmOut = bg;
    el.dataset.mistMmMode = mode;
  }

  /* 叶子节点：没有底色，只有一层调色板彩字。
     源色取 inline 的 color；同理要留一份原色，否则切明暗时会拿「已减淡的字色」当原色重算，
     越算越深。 */
  msbMmToneLeaf(el, mode) {
    const cur = el.style.color || "";
    const out = el.dataset.mistMmOutFg || "";
    if (el.dataset.mistMmMode === mode && out && mmSame(cur, out)) return;
    const base = !out || !mmSame(cur, out) ? cur : el.dataset.mistMmSrcFg || "";
    const fg = mmSoften(base, mode, "leaf");
    if (!fg) {
      /* 黑 / 白 / 灰字：思源默认色，原样放行 */
      delete el.dataset.mistMmOutFg;
      delete el.dataset.mistMmSrcFg;
      return;
    }
    if (!mmSame(cur, fg)) el.style.color = fg;
    if (el.style.getPropertyValue("--mindmap-node-text-color") !== fg) {
      el.style.setProperty("--mindmap-node-text-color", fg);
    }
    el.dataset.mistMmSrcFg = base;
    el.dataset.mistMmOutFg = fg;
  }

  /* 连线是 canvas 画的，DOM 里没有元素可改。
     只包 .mindmap-view__canvas 这一个画布的 2D 上下文，别的 canvas 不碰。 */
  msbMmHookCanvas() {
    const proto = HTMLCanvasElement.prototype;
    if (proto.__mistMmGetContext) return;
    const orig = proto.getContext;
    proto.__mistMmGetContext = orig;
    const self = this;
    proto.getContext = function (type, ...rest) {
      const ctx = orig.call(this, type, ...rest);
      try {
        if (
          type === "2d" &&
          ctx &&
          !ctx.__mistMmWrapped &&
          this.classList &&
          this.classList.contains("mindmap-view__canvas")
        ) {
          self.msbMmWrapCtx(ctx);
        }
      } catch (e) {
        /* 包装失败就当没这功能，绝不连累导图本身 */
      }
      return ctx;
    };
  }

  msbMmWrapCtx(ctx) {
    ctx.__mistMmWrapped = true;
    const self = this;
    const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "strokeStyle");
    if (!d || !d.set || !d.get) return;
    /* 已经算出来的淡色记在这里：导图重绘时若把「我们给过的颜色」再设回来，
       直接透传，否则会淡上加淡，越画越白。 */
    const done = new Set();
    Object.defineProperty(ctx, "strokeStyle", {
      configurable: true,
      enumerable: true,
      get() {
        return d.get.call(ctx);
      },
      set(v) {
        if (typeof v !== "string" || done.has(v)) {
          d.set.call(ctx, v);
          return;
        }
        let out = null;
        try {
          out = self.msbMmLineColor(v);
        } catch (e) {
          out = null;
        }
        if (out && out !== v) done.add(out);
        d.set.call(ctx, out || v);
      },
    });
  }

  msbMmLineColor(v) {
    if (!this._mmOn) return v;
    return mmSoften(v, this.isDark() ? "dark" : "light", "ln") || v;
  }

  msbMmStop() {
    this._mmOn = false;
    if (this._mmTimer) {
      clearTimeout(this._mmTimer);
      this._mmTimer = 0;
    }
    if (this._mmBodyOb) {
      this._mmBodyOb.disconnect();
      this._mmBodyOb = null;
    }
    document.querySelectorAll(".mindmap-view").forEach((v) => {
      if (v.__mistMmOb) {
        v.__mistMmOb.disconnect();
        v.__mistMmOb = null;
      }
    });
    /* 还回思源的原色，而不是 removeProperty：
       removeProperty 会让节点变透明，得等思源下次 updateColors 才回来，
       中间那一瞬间整张图是"掉色"的。存在 dataset 里的原值更可靠。 */
    document.querySelectorAll(".mindmap-view__node").forEach((el) => {
      const src = el.dataset.mistMmSrc;
      const srcFg = el.dataset.mistMmSrcFg;
      if (src) el.style.backgroundColor = src;
      if (srcFg) el.style.color = srcFg;
      el.style.removeProperty("--mindmap-node-text-color");
      delete el.dataset.mistMmSrc;
      delete el.dataset.mistMmSrcFg;
      delete el.dataset.mistMmOut;
      delete el.dataset.mistMmOutFg;
      delete el.dataset.mistMmMode;
    });
    const proto = HTMLCanvasElement.prototype;
    if (proto.__mistMmGetContext) {
      proto.getContext = proto.__mistMmGetContext;
      proto.__mistMmGetContext = null;
    }
  }

  apply() {
    /* 手机端不走整套主题注入：只重建样式表（浮层配色在里面），
       绝不写 data-mist、不写配色变量 —— 手机保持思源默认外观。 */
    if (this._mobileOnly) {
      this.ensureStyle(true);
      return;
    }
    if (!this.isMist()) {
      this.clear();
      return;
    }
    /* clear() 会把 style 标签一起摘掉，所以切回薄雾时必须重建。
       浮动面板的 CSS 是按当前数值生成的，所以这里 force 重建 —— 拖滑块改圆角/动画
       必须让新规则立刻落到 CSS 文本里。 */
    this.ensureStyle(true);
    const root = document.documentElement;
    const st = root.style;
    const mode = this.modeKey();
    const c = this.state[mode] || this.state.light;

    root.setAttribute(FLAG_ATTR, "1");
    st.setProperty("--mist-side-bg", rgbaOf(c.sideColor, c.sideAlpha));
    st.setProperty("--mist-editor-bg", rgbaOf(c.editorColor, c.editorAlpha));
    st.setProperty("--mist-dock-bg", rgbaOf(c.dockColor, c.dockAlpha));
    st.setProperty("--mist-top-bg", rgbaOf(c.topColor, c.topAlpha));

    /* 强调色（0.2.27）：预设可以整体换主色（如仿 wolai 的珊瑚红）。
       除了主题自己的 --mist-accent 三件套，还要压 --b3-theme-primary 一族 ——
       思源原生按钮 / 标签页 / 链接 / 焦点环用的是后者，只改前者会「一半红一半蓝」。
       空值就全部撤掉，回落到 theme.css 的默认蓝。 */
    const acc = String(c.accent || "").trim();
    if (acc) {
      st.setProperty("--mist-accent", acc);
      st.setProperty("--mist-accent-soft", rgbaOf(acc, 12));
      st.setProperty("--mist-accent-line", rgbaOf(acc, 25));
      st.setProperty("--b3-theme-primary", acc);
      st.setProperty("--b3-theme-primary-light", rgbaOf(acc, 72));
      st.setProperty("--b3-theme-primary-lighter", rgbaOf(acc, 48));
      st.setProperty("--b3-theme-primary-lightest", rgbaOf(acc, 12));
    } else {
      ["--mist-accent", "--mist-accent-soft", "--mist-accent-line",
        "--b3-theme-primary", "--b3-theme-primary-light",
        "--b3-theme-primary-lighter", "--b3-theme-primary-lightest",
      ].forEach((v) => st.removeProperty(v));
    }

    /* 区域分割线（0.2.28）：仿 wolai 那套不画线。
       --mist-line 同时供三处：顶栏 border-bottom、.layout__dockl 的 border-right、
       右侧面板 border-left —— 设 transparent 三条一起消失，占位仍是 1px（不会错位）。
       其它预设必须显式 removeProperty，否则从 wolai 切回来线就永久没了。 */
    if (String(c.line || "") === "none") st.setProperty("--mist-line", "transparent");
    else st.removeProperty("--mist-line");

    /* 浮动面板（0.2.9）：外观规则在 style 标签里（floatCss），
       这里只放「随时可变」的时长/缓动，避免拖一次滑块就重建一次 CSS。 */
    const fl = this.state.float || {};
    if (fl.enable) {
      st.setProperty("--mist-float-dur", Math.max(80, Math.min(900, Number(fl.dur) || 300)) + "ms");
      st.setProperty("--mist-float-ease", fl.ease || "cubic-bezier(.16,1,.3,1)");
      root.setAttribute("data-mist-float", fl.anim || "none");
    } else {
      st.removeProperty("--mist-float-dur");
      st.removeProperty("--mist-float-ease");
      root.removeAttribute("data-mist-float");
    }
    /* 浮动面板动画 / 停靠钉住都是桌面布局专属，移动端没有 .layout--float，跳过别空转 */
    if (!this.isMobile()) {
      this.watchFloatDock();
      this.watchPinButtons();
    }

    /* 表格宽度自适应编辑器（用户请求）：开 → html[data-mist-table-fit]，
       由 theme.css 的 [data-mist-table-fit] 段接管表格尺寸（max-width + 固定布局按比例缩）。
       关 → 撤掉属性，回落思源原生 inline-table。 */
    if (this.state.tableFit) root.setAttribute("data-mist-table-fit", "1");
    else root.removeAttribute("data-mist-table-fit");

    /* 背景图 */
    const bg = this.state.bg;
    if (bg.img) {
      st.setProperty("--mist-bg-image", 'url("' + bg.img + '")');
      st.setProperty("--mist-bg-size", bgSizeOf(bg.fit));
      st.setProperty("--mist-bg-repeat", bgRepeatOf(bg.fit));
      st.setProperty("--mist-bg-pos", bgPosOf(bg.pos));
    } else {
      st.removeProperty("--mist-bg-image");
      st.removeProperty("--mist-bg-size");
      st.removeProperty("--mist-bg-repeat");
      st.removeProperty("--mist-bg-pos");
    }
    root.setAttribute("data-mist-scope", bg.scope === "editor" ? "editor" : "window");

    /* 字体字号 */
    const f = this.state.font;
    const ef = cssFont(f.editorFont);
    const tf = cssFont(f.treeFont);
    if (ef) st.setProperty("--mist-editor-font", ef);
    else st.removeProperty("--mist-editor-font");
    if (tf) st.setProperty("--mist-tree-font", tf);
    else st.removeProperty("--mist-tree-font");
    st.setProperty("--mist-editor-size", (f.editorSize || 16) + "px");
    st.setProperty("--mist-tree-size", (f.treeSize || 14) + "px");
    st.setProperty("--mist-title-size", (f.titleSize || 26) + "px");

    /* 字重（2026-11-04）：正文 / 多级标题 / 文档树，交给用户在「字体」页填数字实时调。
       Number() 容错：空串/非法 → NaN → || 兜底到缺省。主题侧用 var(--mist-*-weight, 缺省) 读。 */
    st.setProperty("--mist-editor-weight", (Number(f.editorWeight) || 400));
    st.setProperty("--mist-heading-weight", (Number(f.headingWeight) || 530));
    st.setProperty("--mist-tree-weight", (Number(f.treeWeight) || 400));
    st.setProperty("--mist-title-weight", (Number(f.titleWeight) || 600));

    /* 全局对比度 */
    const base = TEXT_BASE[mode] || TEXT_BASE.light;
    const cv = this.state.contrast;
    for (const [cssVar, key] of TEXT_VARS) {
      if (Number(cv) === 50) {
        st.removeProperty(cssVar);
        continue;
      }
      const rgb = contrastColor(base[key], base.bg, base.far, cv);
      st.setProperty(cssVar, "rgb(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ")");
    }

    /* 文档树图标 */
    if (this.needsIconPaint()) this.paintIcons();

    /* 思维导图配色（0.2.24）：接管节点 inline 色 + canvas 连线色 */
    this.msbMmInit();

    /* 移动端：刷新（或初次建）悬浮侧边栏浮层 */
    if (this.isMobile()) {
      if (!this._msb) this.initMobileSidebar();
      else this.renderMobileItems();
    }
  }

  clear() {
    const root = document.documentElement;
    const st = root.style;
    [
      "--mist-side-bg",
      "--mist-editor-bg",
      "--mist-dock-bg",
      "--mist-top-bg",
      /* 强调色（0.2.27，仿 wolai 那套会写）—— 切走薄雾时必须一起撤，
         否则换个主题还是红按钮。 */
      "--mist-accent",
      "--mist-accent-soft",
      "--mist-accent-line",
      "--b3-theme-primary",
      "--b3-theme-primary-light",
      "--b3-theme-primary-lighter",
      "--b3-theme-primary-lightest",
      /* 分割线（0.2.28，仿 wolai 那套设为 transparent） */
      "--mist-line",
      "--mist-bg-image",
      "--mist-bg-size",
      "--mist-bg-repeat",
      "--mist-bg-pos",
      "--mist-editor-font",
      "--mist-tree-font",
      "--mist-editor-size",
      "--mist-tree-size",
      "--mist-title-size",
      "--mist-editor-weight",
      "--mist-heading-weight",
      "--mist-tree-weight",
      "--mist-title-weight",
      "--mist-float-dur",
      "--mist-float-ease",
    ].forEach((v) => st.removeProperty(v));
    for (const [cssVar] of TEXT_VARS) st.removeProperty(cssVar);
    root.removeAttribute(FLAG_ATTR);
    root.removeAttribute("data-mist-scope");
    root.removeAttribute("data-mist-float");
    root.removeAttribute("data-mist-table-fit");
    document.querySelectorAll(".mist-float-pop").forEach((el) => el.classList.remove("mist-float-pop"));
    this.unwatchFloatDock();
    this.unwatchPinButtons();
    this.removePinButtons();
    this.releaseAllLocks();
    this.restoreIcons();
    /* 导图配色要连 canvas 的 hook 一起撤，否则切走主题后连线还是绿的 */
    this.msbMmStop();
    /* 主题切走时设置面板必须一起收（0.2.20）。
       否则会出现「界面已经换回别的主题，薄雾设置窗却还开着、怎么调都没反应」
       的诡异状态 —— 老板 2026-10-31 报的正是这个。 */
    if (this._dlg) {
      try {
        this._dlg.destroy();
      } catch (e) {
        /* ignore */
      }
      this._dlg = null;
    }
    this.closeDockPanel();
    /* 移动端浮层：连同引用一起摘掉，否则切走薄雾主题还会留个把手。
       但手机端（_mobileOnly）浮层与主题无关，clear() 不能拆它 —— 拆了把手就永久消失。 */
    if (!this._mobileOnly) {
      const msb = document.querySelector(".mist-msb");
      if (msb) msb.remove();
      this._msb = null;
      this._msbHandle = null;
      this._msbPanel = null;
      this._msbBody = null;
      this._msbCnt = null;
      this._msbIndex = {};
      const el = document.getElementById(STYLE_ID);
      if (el) el.remove();
      return;
    }
    /* 手机端：样式表要留着（浮层配色在里面），重建一份即可 */
    this.ensureStyle(true);
  }

  /* ================= 手机端悬浮面板（0.2.17 重构）=================

     设计对齐原型「移动端-综合演示.html」：窄磨砂玻璃面板 + iOS 资源库式图标格子。

     ‼ 三条硬事实（真机 + 思源 mobile build 源码确认，别再猜）：
     ① 手机端是独立前端，没有 .dock__item。左右抽屉是 #sidebar / #sidebarRight，
        里面 `.toolbar__scroll [data-type="sidebar-*-tab"]` 才是「有单独页面的功能入口」。
        思源自带只有 7 个：
          左：sidebar-file-tab 文档树 / sidebar-bookmark-tab 书签
              sidebar-tag-tab 标签 / sidebar-inbox-tab 收件箱
          右：sidebar-outline-tab 大纲 / sidebar-backlink-tab 反向链接
              sidebar-agent-tab 智能体
        插件注册的侧栏页也插在同一处 —— 直接枚举活的 DOM，既不会漏插件的，
        也不会像之前「点底栏 [data-action]」那样变成页签/别的行为。
     ② 打开抽屉 = 把 #sidebar / #sidebarRight 的 inline transform 设成 translateX(0px)，
        并清掉另一个的 transform。这就是思源自己开抽屉的做法。
     ③ 长按编辑：拖动排序 + 角标隐藏，顺序与隐藏项存 state.msb（key 用稳定 id）。
     ============================================================== */

  mobileSidebarCss() {
    return [
      /* 色板：冷调玻璃 + 白卡，暗色单独一套（之前那块永远白玻璃，暗色下很突兀） */
      ".mist-msb{position:fixed;inset:0;z-index:40;pointer-events:none;" +
        "--msb-w:214px;--msb-gap:10px;--msb-cols:4;--msb-rad:20px;--msb-alpha:.64;" +
        "--msb-bg:rgba(247,249,253,var(--msb-alpha));" +
        "--msb-line:rgba(255,255,255,.56);" +
        "--msb-fg:#3d434b;--msb-fg2:#8a929c;" +
        "--msb-ico-bg:#fff;" +
        "--msb-ico-sh:0 3px 8px rgba(40,50,80,.16),inset 0 1px 0 rgba(255,255,255,.35);" +
        "--msb-press:rgba(255,255,255,.55);" +
        "--msb-blur:20px;--msb-sat:180%;" +
        "--msb-dur:280ms;--msb-ease:cubic-bezier(.16,1,.3,1);}",
      'html[data-theme-mode="dark"] .mist-msb{' +
        "--msb-bg:rgba(34,37,42,var(--msb-alpha));--msb-line:rgba(255,255,255,.1);" +
        "--msb-fg:#e6e8ec;--msb-fg2:#98a0aa;" +
        "--msb-ico-bg:rgba(74,78,86,.92);--msb-ico-sh:none;" +
        "--msb-press:rgba(255,255,255,.08);}",

      /* 遮罩：只压暗不模糊 —— 模糊会把背后顶栏一起糊掉，层级全乱 */
      ".mist-msb-scrim{position:absolute;inset:0;background:rgba(28,34,44,.14);opacity:0;pointer-events:none;transition:opacity 220ms linear;}",
      ".mist-msb-show .mist-msb-scrim{opacity:1;pointer-events:auto;}",

      /* 收起态把手：原型 style-a（竖排文字 + 圆点），30×104 玻璃片。
         离边只留 2px —— 思源移动端「从边缘往内滑」是开抽屉的手势，
         把手压住边缘会把这条手势吃掉，表现就是「笔记页滑不动，一滑直接进左栏」。
         把手上再补 touchstart/touchmove 的 stopPropagation（见 bindMobileHandle），
         手指落在把手上时的滑动只用来切边/移动，不传给思源。 */
      ".mist-msb-handle{position:fixed;top:50%;transform:translateY(-50%);width:30px;height:104px;" +
        "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;" +
        "background:var(--msb-bg);" +
        "backdrop-filter:blur(var(--msb-blur)) saturate(var(--msb-sat));" +
        "-webkit-backdrop-filter:blur(var(--msb-blur)) saturate(var(--msb-sat));" +
        "border:1px solid var(--msb-line);" +
        "box-shadow:-2px 4px 18px rgba(50,60,90,.14),inset 0 1px 0 rgba(255,255,255,.7);" +
        "pointer-events:auto;touch-action:none;cursor:pointer;z-index:41;" +
        "user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;" +
        "transition:opacity .2s ease,transform .2s ease;}",
      '.mist-msb[data-side="right"] .mist-msb-handle{right:2px;left:auto;border-radius:16px 0 0 16px;border-right:none;}',
      '.mist-msb[data-side="left"] .mist-msb-handle{left:2px;right:auto;border-radius:0 16px 16px 0;border-left:none;}',
      ".mist-msb-hlabel{writing-mode:vertical-rl;font-size:11.5px;font-weight:500;letter-spacing:3px;color:var(--msb-fg2);}",
      ".mist-msb-hdot{width:5px;height:5px;border-radius:50%;background:var(--msb-fg2);opacity:.75;}",

      /* 把手 A（默认）：30×104 竖排文字 + 圆点
         把手 B：40×40 方形，只留一个字，省地方
         把手 C：8×76 细条，几乎不挡正文（长表格友好） */
      '.mist-msb[data-msb-style="b"] .mist-msb-handle{width:42px;height:42px;gap:0;border-radius:14px;}',
      '.mist-msb[data-msb-style="b"][data-side="right"] .mist-msb-handle{border-radius:14px 0 0 14px;}',
      '.mist-msb[data-msb-style="b"][data-side="left"] .mist-msb-handle{border-radius:0 14px 14px 0;}',
      '.mist-msb[data-msb-style="b"] .mist-msb-hlabel{writing-mode:horizontal-tb;letter-spacing:0;font-size:12px;}',
      '.mist-msb[data-msb-style="b"] .mist-msb-hdot{display:none;}',
      '.mist-msb[data-msb-style="c"] .mist-msb-handle{width:9px;height:76px;background:rgba(150,160,175,.55);' +
        'backdrop-filter:none;-webkit-backdrop-filter:none;border:0;box-shadow:none;border-radius:4px;}',
      '.mist-msb[data-msb-style="c"][data-side="right"] .mist-msb-handle{border-radius:4px 0 0 4px;}',
      '.mist-msb[data-msb-style="c"][data-side="left"] .mist-msb-handle{border-radius:0 4px 4px 0;}',
      '.mist-msb[data-msb-style="c"] .mist-msb-hlabel,.mist-msb[data-msb-style="c"] .mist-msb-hdot{display:none;}',

      /* 外观设置视图 */
      ".mist-msb-lookrow{margin-bottom:11px;}",
      ".mist-msb-lookrow:last-child{margin-bottom:2px;}",
      ".mist-msb-looklb{font-size:10.5px;color:var(--msb-fg2);margin-bottom:5px;padding-left:2px;letter-spacing:.3px;}",
      ".mist-msb-chips{display:flex;flex-wrap:wrap;gap:5px;}",
      ".mist-msb-chip{flex:0 0 auto;min-width:38px;padding:5px 9px;border-radius:9px;text-align:center;" +
        "font-size:11.5px;line-height:1.4;color:var(--msb-fg);background:rgba(255,255,255,.62);cursor:pointer;" +
        "-webkit-tap-highlight-color:transparent;}",
      ".mist-msb-chip.on{background:var(--b3-theme-primary,#3b82f6);color:#fff;}",
      ".mist-msb-chip:active{opacity:.75;}",
      ".mist-msb-lookfoot{display:flex;gap:6px;margin-top:14px;}",
      ".mist-msb-reset{flex:1;padding:8px 0;border:1px solid var(--msb-line);border-radius:11px;background:transparent;" +
        "color:var(--msb-fg2);font-size:11.5px;cursor:pointer;}",
      ".mist-msb-handle.mist-msb-dragging{transition:none;}",
      ".mist-msb-show .mist-msb-handle{opacity:0;pointer-events:none;}",

      /* 展开态面板：宽度由「列数 × 宽度档」算出来写进 --msb-w（别用 min()：老 WebView
         Chrome<79 不支持，整条声明会失效 → width 变 auto → 被文字撑到接近满屏，上一轮翻过车）。
         高度：0.2.22 起改成**固定 56vh**，不再跟着内容长；列数怎么改高度都一样，
         内容多了由 body 内部滚动。之前用 max-height 让内容撑开，老板嫌「面板太高」。 */
      ".mist-msb-panel{position:fixed;top:50%;right:var(--msb-gap);" +
        "width:var(--msb-w);max-width:calc(100vw - 40px);" +
        "height:56vh;max-height:calc(100% - 150px);" +
        "display:flex;flex-direction:column;overflow:hidden;" +
        "background:var(--msb-bg);" +
        "backdrop-filter:blur(var(--msb-blur)) saturate(var(--msb-sat));" +
        "-webkit-backdrop-filter:blur(var(--msb-blur)) saturate(var(--msb-sat));" +
        "border:1px solid var(--msb-line);border-radius:var(--msb-rad);" +
        "box-shadow:0 22px 52px rgba(44,56,92,.26),-8px 6px 26px rgba(44,56,92,.13),0 4px 12px rgba(0,0,0,.07),inset 0 1px 0 rgba(255,255,255,.9);" +
        "opacity:0;pointer-events:none;z-index:41;" +
        "transform:translateY(-50%) translateX(calc(var(--msb-w) + 26px));" +
        "transition:transform var(--msb-dur) var(--msb-ease),opacity 200ms linear;}",
      '.mist-msb[data-side="left"] .mist-msb-panel{right:auto;left:var(--msb-gap);' +
        "transform:translateY(-50%) translateX(calc(-1 * (var(--msb-w) + 26px)));" +
        "box-shadow:0 22px 52px rgba(44,56,92,.26),8px 6px 26px rgba(44,56,92,.13),0 4px 12px rgba(0,0,0,.07),inset 0 1px 0 rgba(255,255,255,.9);}",
      '.mist-msb-show[data-side="right"] .mist-msb-panel' +
        ',.mist-msb-show[data-side="left"] .mist-msb-panel{opacity:1;pointer-events:auto;transform:translateY(-50%) translateX(0);}',

      /* 顶条：标题 + 计数 + 设置 + 关闭 */
      ".mist-msb-head{position:relative;display:flex;align-items:center;gap:6px;padding:13px 10px 8px 14px;flex:0 0 auto;}",
      ".mist-msb-title{font-size:13px;font-weight:650;color:var(--msb-fg);letter-spacing:.2px;" +
        "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".mist-msb-cnt{font-size:11px;color:var(--msb-fg2);margin-left:auto;flex:0 0 auto;font-variant-numeric:tabular-nums;}",
      ".mist-msb-btn{flex:0 0 auto;width:22px;height:22px;display:flex;align-items:center;justify-content:center;" +
        "padding:0;border:0;border-radius:50%;background:rgba(140,150,165,.16);color:var(--msb-fg2);" +
        "font-size:13px;line-height:1;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
      ".mist-msb-btn svg{width:13px;height:13px;fill:currentColor;}",
      ".mist-msb-btn:active{background:var(--msb-press);}",

      /* 滚区：惯性滚动、藏滚动条、底部让开 iPhone home 条 */
      ".mist-msb-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;" +
        "overscroll-behavior:contain;padding:2px 10px calc(14px + env(safe-area-inset-bottom,0px));}",
      ".mist-msb-body::-webkit-scrollbar{width:0;height:0;}",

      /* 三个分区 */
      ".mist-msb-sec{margin-top:14px;}",
      ".mist-msb-sec:first-child{margin-top:2px;}",
      ".mist-msb-sec-t{font-size:10.5px;font-weight:600;letter-spacing:.4px;color:var(--msb-fg2);padding:0 3px 8px;}",
      /* 列数用属性分档，不写 repeat(var(--x))：变量进不进得了重复次数各版本不一致，
         一旦不吃整条声明作废，格子会排成一列。 */
      ".mist-msb-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px 4px;align-content:start;}",
      /* 列数用属性分档（不写 repeat(var(--x))：变量进不进得了重复次数各版本不一致，
         一旦不吃整条声明作废，格子会排成一列）。
         0.2.22：老板要求「改列数时面板宽度跟着变、但图标不要放大」——
         所以这里只管列与间距，宽度由 msbApplyLook 按 列数×宽度档 算；
         图标统一 40px 不再按列数放大，2 列也一样。 */
      '.mist-msb[data-msb-cols="2"] .mist-msb-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:13px 10px;}',
      '.mist-msb[data-msb-cols="3"] .mist-msb-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 8px;}',
      '.mist-msb[data-msb-cols="5"] .mist-msb-grid{grid-template-columns:repeat(5,minmax(0,1fr));gap:10px 2px;}',
      /* 5 列时面板虽已加宽，但格子只有 43px 左右，40px 图标贴边太挤 → 缩到 34 */
      '.mist-msb[data-msb-cols="5"] .mist-msb-ico{width:34px;height:34px;border-radius:10px;}',
      '.mist-msb[data-msb-cols="5"] .mist-msb-ico svg{width:17px;height:17px;}',

      /* 格子：图标 40px 在上、10.5px 文字在下 */
      ".mist-msb-cell{display:flex;flex-direction:column;align-items:center;gap:5px;padding:0;" +
        "border-radius:10px;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent;" +
        "-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;}",
      ".mist-msb-ico{width:40px;height:40px;border-radius:12px;background:var(--msb-ico-bg);" +
        "box-shadow:var(--msb-ico-sh);display:flex;align-items:center;justify-content:center;" +
        "overflow:hidden;position:relative;transition:transform .14s ease;}",
      '.mist-msb-ico::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;' +
        "background:linear-gradient(160deg,rgba(255,255,255,.26),rgba(255,255,255,0) 52%);}",
      ".mist-msb-ico svg{width:20px;height:20px;fill:var(--msb-fg);opacity:.85;position:relative;z-index:1;}",
      ".mist-msb-ico img{width:26px;height:26px;object-fit:contain;border-radius:7px;position:relative;z-index:1;}",
      ".mist-msb-cell:active .mist-msb-ico{transform:scale(.92);}",
      ".mist-msb-lb{font-size:10.5px;line-height:1.25;color:var(--msb-fg);text-align:center;" +
        "max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",

      /* 隐藏项：灰度 + 变淡，一眼看出「被取消了」 */
      '.mist-msb-cell[data-hidden="1"] .mist-msb-ico{filter:grayscale(.9) opacity(.45);}',
      '.mist-msb-cell[data-hidden="1"] .mist-msb-lb{color:var(--msb-fg2);}',

      /* 编辑态：抖动 + 角标 */
      ".mist-msb-editing .mist-msb-cell .mist-msb-ico{animation:mist-msb-wobble .3s ease-in-out infinite alternate;}",
      ".mist-msb-editing .mist-msb-cell:nth-child(2n) .mist-msb-ico{animation-delay:-.15s;}",
      "@keyframes mist-msb-wobble{from{transform:rotate(-1.6deg);}to{transform:rotate(1.6deg);}}",
      ".mist-msb-badge{display:none;position:absolute;top:-5px;left:-3px;width:17px;height:17px;" +
        "border-radius:50%;background:#8e959e;color:#fff;font-size:12px;font-weight:600;line-height:17px;" +
        "text-align:center;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.25);}",
      ".mist-msb-editing .mist-msb-badge{display:block;}",
      '.mist-msb-cell[data-hidden="1"] .mist-msb-badge{background:#4a90e2;}',
      ".mist-msb-cell.mist-msb-dragging{opacity:.5;pointer-events:none;touch-action:none;z-index:3;}",

      /* 编辑条 */
      ".mist-msb-foot{flex:0 0 auto;display:none;align-items:center;gap:8px;" +
        "padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));" +
        "border-top:1px solid var(--msb-line);font-size:10.5px;color:var(--msb-fg2);}",
      ".mist-msb-editing .mist-msb-foot{display:flex;}",
      ".mist-msb-done{margin-left:auto;padding:4px 13px;border:0;border-radius:12px;" +
        "background:var(--b3-theme-primary,#3b82f6);color:#fff;font-size:11.5px;line-height:1.6;cursor:pointer;}",

      /* 外观页底部的「显示的项目」清单（0.2.21）
         老板反馈「面板中关闭的图标没地方重新开启」—— 编辑态的 + 角标要长按才进得去，
         不够显式。这里给一份常驻清单，一行一项、右侧开关，关/开随时来回。 */
      ".mist-msb-tgls{margin:2px 0 6px;}",
      ".mist-msb-tgl{display:flex;align-items:center;gap:8px;padding:5px 3px;border-radius:8px;cursor:pointer;" +
        "-webkit-tap-highlight-color:transparent;}",
      ".mist-msb-tgl:active{background:var(--msb-press);}",
      ".mist-msb-tgl-lb{flex:1;min-width:0;font-size:11px;line-height:1.5;color:var(--msb-fg);" +
        "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".mist-msb-tgl.off .mist-msb-tgl-lb{color:var(--msb-fg2);}",
      ".mist-msb-tgl-sw{flex:0 0 auto;width:30px;height:17px;border-radius:9px;" +
        "background:rgba(140,150,165,.32);position:relative;transition:background .16s ease;}",
      '.mist-msb-tgl-sw::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;' +
        "border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .16s ease;}",
      ".mist-msb-tgl.on .mist-msb-tgl-sw{background:var(--b3-theme-primary,#3b82f6);}",
      ".mist-msb-tgl.on .mist-msb-tgl-sw::after{transform:translateX(13px);}",
    ];
  }

  initMobileSidebar() {
    if (this._msb) return;
    const st = this.msbState();
    const setIcon = document.getElementById("iconSettings") ? "#iconSettings" : "#iconMore";
    this._msbMode = "grid";
    const root = document.createElement("div");
    root.className = "mist-msb";
    root.setAttribute("data-side", st.side);
    root.setAttribute("data-prevent-swipe", "true");
    root.innerHTML =
      '<div class="mist-msb-scrim"></div>' +
      '<div class="mist-msb-handle"><span class="mist-msb-hlabel">面板</span><i class="mist-msb-hdot"></i></div>' +
      '<div class="mist-msb-panel">' +
      '<div class="mist-msb-head">' +
      '<b class="mist-msb-title">面板</b>' +
      '<span class="mist-msb-cnt"></span>' +
      '<button class="mist-msb-btn mist-msb-look" type="button" aria-label="面板外观">' +
      '<svg><use xlink:href="' + setIcon + '"></use></svg></button>' +
      '<button class="mist-msb-btn mist-msb-x" type="button" aria-label="关闭">&times;</button>' +
      "</div>" +
      '<div class="mist-msb-body"></div>' +
      '<div class="mist-msb-foot"><span>按住图标拖动排序 · <b>−</b> 隐藏 / <b>+</b> 恢复</span>' +
      '<button class="mist-msb-done" type="button">完成</button></div>' +
      "</div>";
    document.body.appendChild(root);

    this._msb = root;
    this._msbHandle = root.querySelector(".mist-msb-handle");
    this._msbPanel = root.querySelector(".mist-msb-panel");
    this._msbBody = root.querySelector(".mist-msb-body");
    this._msbTitle = root.querySelector(".mist-msb-title");
    this._msbCnt = root.querySelector(".mist-msb-cnt");
    this._msbEdit = false;
    this._msbDrag = null;
    this._msbIndex = {};

    if (st.posY !== 50) this._msbHandle.style.top = st.posY + "%";

    this.msbApplyLook();
    this.renderMobileItems();
    this.bindMobileHandle();
    this.msbBindEvents();
  }

  /* 手机端标题补位已整体移除（0.2.16）：
     老板定的是「手机端保持思源默认外观」，再插一个假标题就是画蛇添足。
     思源自己在顶栏 #toolbarName 里显示标题，够用。 */

  toggleMobileSidebar(force) {
    if (!this._msb) return;
    const show = force == null ? !this._msb.classList.contains("mist-msb-show") : !!force;
    if (!show && this._msbEdit) this.msbExitEdit();
    this._msb.classList.toggle("mist-msb-show", show);
    if (show) this.renderMobileItems(); /* 每次展开刷新：侧栏页可能被插件动态加/删 */
  }

  /* ---------- 顺序 / 隐藏的持久化 ---------- */

  /* 面板自身的可调项（原型「移动端-悬浮侧边栏.html」里那套）：
     wq 宽度档 / cols 列数 / rad 圆角 / blur 磨砂 / alpha 底色浓度 / style 把手款 / side 贴哪边 / posY 竖向位置
     0.2.22：宽度不再是绝对像素，改成「列数基准宽 × 档位」，2 列自然更窄、5 列自然更宽。 */
  msbDefaultLook() {
    return { wq: "m", cols: 4, rad: 20, blur: 20, alpha: 0.64, style: "a", side: "right", posY: 50 };
  }

  /* 每种列数对应的基准宽（px）。不是拍脑袋：格子宽 = (面板宽 - 左右 padding 20 - 列间距) / 列数，
     要保证 ≥ 44px 才装得下 40px 图标 + 两侧余量（2 列 58 / 3 列 50 / 4 列 45 / 5 列 43）。 */
  msbColsBase(cols) {
    const map = { 2: 148, 3: 188, 4: 214, 5: 244 };
    return map[cols] || map[4];
  }

  /* 宽度档是相对基准的缩放，不做绝对像素：换列数时宽度自动跟着走，老板要的正是这个联动。 */
  msbWidthPx(st) {
    const scale = st.wq === "s" ? 0.88 : st.wq === "l" ? 1.12 : 1;
    return Math.round(this.msbColsBase(st.cols) * scale);
  }

  msbState() {
    const def = this.msbDefaultLook();
    if (!this.state.msb || typeof this.state.msb !== "object") {
      this.state.msb = { order: [], hidden: [] };
    }
    const s = this.state.msb;
    if (!Array.isArray(s.order)) s.order = [];
    if (!Array.isArray(s.hidden)) s.hidden = [];
    if (s.side !== "left" && s.side !== "right") s.side = def.side;
    if (typeof s.posY !== "number" || !isFinite(s.posY)) s.posY = def.posY;
    /* 外观项可能来自旧版本的状态文件（没有这些键），缺什么补什么 */
    for (const k of ["cols", "rad", "blur", "alpha"]) {
      if (typeof s[k] !== "number" || !isFinite(s[k])) s[k] = def[k];
    }
    if (s.style !== "a" && s.style !== "b" && s.style !== "c") s.style = def.style;
    if (s.wq !== "s" && s.wq !== "m" && s.wq !== "l") {
      /* 0.2.21 及以前存的是像素 w（196/216/244/272）→ 就近映射成档位，别让老配置的面板突然变样 */
      const old = typeof s.w === "number" && isFinite(s.w) ? s.w : 0;
      s.wq = old && old <= 206 ? "s" : old >= 236 ? "l" : "m";
    }
    return s;
  }

  /* 把状态落到 DOM：变量写在 root 的 inline style 上，CSS 规则里只留默认值。
     这样拖一次滑块不用重建整张样式表。 */
  msbApplyLook() {
    if (!this._msb) return;
    const st = this.msbState();
    const r = this._msb;
    r.style.setProperty("--msb-w", this.msbWidthPx(st) + "px");
    r.style.setProperty("--msb-cols", String(st.cols));
    r.style.setProperty("--msb-rad", st.rad + "px");
    r.style.setProperty("--msb-blur", st.blur + "px");
    r.style.setProperty("--msb-alpha", String(st.alpha));
    r.setAttribute("data-side", st.side);
    r.setAttribute("data-msb-style", st.style);
    r.setAttribute("data-msb-cols", String(st.cols));
    if (this._msbHandle) {
      this._msbHandle.style.top = st.posY + "%";
      this._msbHandle.style.transform = "translateY(-50%)";
    }
  }

  /* 没进过 order 的项保持原顺序排在后面（Array.sort 在现代引擎是稳定的） */
  msbSort(items) {
    const order = this.msbState().order;
    const idx = (id) => {
      const i = order.indexOf(id);
      return i < 0 ? 9999 : i;
    };
    return items.slice().sort((a, b) => idx(a.id) - idx(b.id));
  }

  msbCommitOrder() {
    if (!this._msbBody) return;
    const order = [];
    this._msbBody.querySelectorAll(".mist-msb-cell").forEach((c) => {
      const id = c.getAttribute("data-id");
      if (id && order.indexOf(id) < 0) order.push(id);
    });
    const st = this.msbState();
    if (order.length && order.join("|") !== st.order.join("|")) {
      st.order = order;
      this.saveState();
    }
  }

  msbToggleHidden(id) {
    if (!id) return;
    const st = this.msbState();
    const i = st.hidden.indexOf(id);
    if (i < 0) st.hidden.push(id);
    else st.hidden.splice(i, 1);
    this.saveState();
    this.renderMobileItems();
  }

  msbEnterEdit() {
    if (this._msbEdit) return;
    this._msbEdit = true;
    this.renderMobileItems();
    try {
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (e) {
      /* 有些 WebView 禁震动，忽略 */
    }
  }

  msbExitEdit() {
    if (!this._msbEdit) return;
    this.msbEndDrag(true); /* 拖到一半点「完成」：先撒手再重绘，不然监听器留在 document 上 */
    this._msbEdit = false;
    this.msbCommitOrder();
    this.renderMobileItems();
  }

  /* ---------- 采集：左右抽屉的真实 tab（思源 7 个 + 插件注册的侧栏页）---------- */

  collectMsbItems() {
    const panels = [];
    const pluginPages = [];
    const seen = {};

    const scan = (side) => {
      const root = document.getElementById(side === "left" ? "sidebar" : "sidebarRight");
      if (!root) return;
      const bar = root.querySelector(".toolbar__scroll") || root.querySelector(".toolbar");
      if (!bar) return;
      bar.querySelectorAll("[data-type]").forEach((el) => {
        const type = el.getAttribute("data-type") || "";
        /* 不再只认 sidebar-*-tab：插件注册的侧栏页 data-type 是插件自己起的名字。
           放宽成「有 data-type 就算一个页面」，内置/插件归属交给 MSB_BUILTIN 区分。 */
        if (!type) return;
        const use = el.querySelector("use");
        const raw = (use && (use.getAttribute("xlink:href") || use.getAttribute("href"))) || "";
        const builtinLabel = MSB_BUILTIN[type];
        const id = "panel:" + side + ":" + type;
        if (seen[id]) return;
        seen[id] = 1;
        const item = {
          id: id,
          kind: "panel",
          side: side,
          type: type,
          icon: raw.replace(/^#/, "") || "iconMore",
          label:
            builtinLabel ||
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            type.replace(/^sidebar-/, "").replace(/-tab$/, ""),
          muted: el.classList.contains("fn__none"),
        };
        if (builtinLabel) panels.push(item);
        else pluginPages.push(item); /* 插件注册到侧栏的页面 */
      });
    };
    scan("left");
    scan("right");

    /* 插件插在移动端顶栏的按钮 */
    const builtinTopIds = ["toolbarSidebarLeft", "toolbarSync", "toolbarSidebarRight", "toolbarBack"];
    document.querySelectorAll("#mobileTopBar button").forEach((btn) => {
      if (btn.id && builtinTopIds.indexOf(btn.id) >= 0) return;
      const use = btn.querySelector("use");
      if (!use) return;
      const raw = use.getAttribute("xlink:href") || use.getAttribute("href") || "";
      const id = "top:" + (btn.id || raw || btn.className || "btn");
      if (seen[id]) return;
      seen[id] = 1;
      pluginPages.push({
        id: id,
        kind: "topbarBtn",
        el: btn,
        label: btn.getAttribute("aria-label") || btn.title || "插件按钮",
        icon: raw.replace(/^#/, "") || "iconPlugin",
      });
    });

    /* 插件注册的命令（手机端插件没有 dock 位，命令是仅剩的使用入口） */
    for (const c of this.commandList()) {
      const cid = String((c && c.id) || "");
      if (cid.indexOf("plugin-") !== 0) continue;
      const id = "cmd:" + cid;
      if (seen[id]) continue;
      seen[id] = 1;
      pluginPages.push({ id: id, kind: "command", cmd: c, label: msbCmdLabel(c), icon: "iconPlugin" });
    }

    /* 插件设置页：有 openSetting / setting 的插件 */
    const pluginSettings = [];
    const plugins = this.app && this.app.plugins ? Object.values(this.app.plugins) : [];
    for (const p of plugins) {
      const name = p && p.name;
      if (!name) continue;
      if (name === this.name || typeof p.openSetting === "function" || p.setting) {
        pluginSettings.push({
          id: "setting:" + name,
          kind: "pluginSetting",
          name: name,
          label: pluginLabelOf(p) || name,
          iconUrl: "/plugins/" + name + "/icon.png",
        });
      }
    }
    return { panels, pluginPages, pluginSettings };
  }

  /* 命令表在各版本挂的位置不一样：app.commands.commands / app.commands 本身 /
     window.siyuan.commands。挨个试，拿到第一个非空数组。 */
  commandList() {
    const cands = [];
    try {
      const m = this.app && this.app.commands;
      if (m) cands.push(m.commands, m._commands, m);
    } catch (e) {
      /* ignore */
    }
    try {
      if (window.siyuan && window.siyuan.commands) cands.push(window.siyuan.commands);
    } catch (e) {
      /* ignore */
    }
    for (const c of cands) {
      if (Array.isArray(c) && c.length) return c;
    }
    return [];
  }

  /* ---------- 面板外观设置 ---------- */

  /* 不另开弹窗：面板本来就只有两百来像素宽，再弹一个对话框反而更绕；
     就地换内容 + 改完立刻能看到效果，才是「调外观」该有的手感。 */
  /* 点一个外观选项：落到状态 → 立刻生效 → 重画高亮。
     选择器走 data-k / data-v，数字型的自动转 Number（0.42 这种不能变字符串）。 */
  msbPickLook(chip) {
    if (!chip) return;
    const k = chip.getAttribute("data-k");
    const raw = chip.getAttribute("data-v");
    if (!k || raw == null) return;
    const val = /^-?[\d.]+$/.test(raw) ? Number(raw) : raw;
    const cur = this.msbState();
    if (String(cur[k]) === String(val)) return;
    cur[k] = val;
    this.saveState();
    this.msbApplyLook();
    this.msbRenderLook();
  }

  msbRenderLook() {
    const st = this.msbState();
    const body = this._msbBody;
    body.innerHTML = "";
    if (this._msbTitle) this._msbTitle.textContent = "面板外观";
    if (this._msbCnt) this._msbCnt.textContent = "";

    const rows = [
      { k: "cols", t: "列数", opts: [[2, "2"], [3, "3"], [4, "4"], [5, "5"]] },
      /* 宽度是「相对列数基准」的档位，不是绝对像素：2 列自然更窄、5 列自然更宽 */
      { k: "wq", t: "宽度", opts: [["s", "窄"], ["m", "标准"], ["l", "宽"]] },
      { k: "rad", t: "圆角", opts: [[10, "小"], [20, "中"], [28, "大"]] },
      { k: "blur", t: "磨砂", opts: [[0, "关"], [10, "弱"], [20, "中"], [30, "强"]] },
      { k: "alpha", t: "底色", opts: [[0.42, "淡"], [0.64, "中"], [0.82, "浓"]] },
      { k: "style", t: "把手", opts: [["a", "竖条"], ["b", "方块"], ["c", "细条"]] },
      { k: "side", t: "贴边", opts: [["left", "左"], ["right", "右"]] },
      { k: "posY", t: "竖向位置", opts: [[28, "上"], [50, "中"], [72, "下"]] },
    ];

    const sec = document.createElement("div");
    sec.className = "mist-msb-sec";
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "mist-msb-lookrow";
      const lb = document.createElement("div");
      lb.className = "mist-msb-looklb";
      lb.textContent = r.t;
      const chips = document.createElement("div");
      chips.className = "mist-msb-chips";
      for (const opt of r.opts) {
        const b = document.createElement("div");
        b.className = "mist-msb-chip" + (String(st[r.k]) === String(opt[0]) ? " on" : "");
        b.setAttribute("data-k", r.k);
        b.setAttribute("data-v", String(opt[0]));
        b.textContent = opt[1];
        chips.appendChild(b);
      }
      row.appendChild(lb);
      row.appendChild(chips);
      sec.appendChild(row);
    }

    /* 点击统一由 msbBindEvents 挂在常驻 body 上的委托处理，这里不重复绑 */

    const foot = document.createElement("div");
    foot.className = "mist-msb-lookfoot";
    const reset = document.createElement("button");
    reset.className = "mist-msb-reset";
    reset.type = "button";
    reset.textContent = "恢复默认尺寸";
    reset.addEventListener("click", () => {
      const def = this.msbDefaultLook();
      const cur = this.msbState();
      /* 贴边方向和竖向位置是「手感」，不属于外观参数，重置时不碰 */
      for (const k of ["wq", "cols", "rad", "blur", "alpha", "style"]) cur[k] = def[k];
      this.saveState();
      this.msbApplyLook();
      this.msbRenderLook();
    });
    foot.appendChild(reset);

    body.appendChild(sec);
    body.appendChild(this.msbRenderToggles());
    body.appendChild(foot);
  }

  /* 外观页底部的「显示的项目」清单（0.2.21）
     老板原话：「面板中关闭的图标没有地方重新开启」。
     编辑态的 − / + 角标要求长按 460ms 才进得去，不够显式；
     这里给一份常驻清单：一行一项、右侧开关，随时关随时开。
     分组沿用网格里的三类，隐藏项变灰但**仍在原位**，不会「消失后找不回来」。 */
  msbRenderToggles() {
    const wrap = document.createElement("div");
    wrap.className = "mist-msb-sec";
    const hidden = this.msbState().hidden;
    const { panels, pluginPages, pluginSettings } = this.collectMsbItems();

    const title = document.createElement("div");
    title.className = "mist-msb-sec-t";
    title.textContent = "显示哪些项目（关掉的在面板里不出现）";
    wrap.appendChild(title);

    const list = document.createElement("div");
    list.className = "mist-msb-tgls";

    const groups = [
      ["思源自带", panels],
      ["插件 · 使用页", pluginPages],
      ["插件 · 设置页", pluginSettings],
    ];
    for (const [gname, arr] of groups) {
      if (!arr.length) continue;
      const gt = document.createElement("div");
      gt.className = "mist-msb-sec-t";
      gt.style.padding = "6px 3px 2px";
      gt.textContent = gname;
      list.appendChild(gt);
      for (const it of arr) {
        const off = hidden.indexOf(it.id) >= 0;
        const row = document.createElement("div");
        row.className = "mist-msb-tgl" + (off ? " off" : " on");
        row.setAttribute("data-tgl", it.id);
        const lb = document.createElement("div");
        lb.className = "mist-msb-tgl-lb";
        lb.textContent = it.label || it.id;
        const sw = document.createElement("div");
        sw.className = "mist-msb-tgl-sw";
        row.appendChild(lb);
        row.appendChild(sw);
        list.appendChild(row);
      }
    }
    wrap.appendChild(list);
    return wrap;
  }

  /* ---------- 渲染 ---------- */

  renderMobileItems() {
    if (!this._msbBody) return;
    if (this._msbMode === "look") {
      this.msbRenderLook();
      return;
    }
    if (this._msbTitle) this._msbTitle.textContent = "面板";
    const hidden = this.msbState().hidden;
    const editing = !!this._msbEdit;
    const { panels, pluginPages, pluginSettings } = this.collectMsbItems();
    const body = this._msbBody;
    body.innerHTML = "";
    this._msbIndex = {};

    const total = panels.length + pluginPages.length + pluginSettings.length;
    if (this._msbCnt) this._msbCnt.textContent = String(total);
    this._msb.classList.toggle("mist-msb-editing", editing);

    const addSec = (title, arr) => {
      /* 编辑态要把隐藏项也画出来，否则用户取消完就找不回来了 */
      const list = editing ? arr : arr.filter((it) => hidden.indexOf(it.id) < 0);
      if (!list.length) return;
      const sec = document.createElement("div");
      sec.className = "mist-msb-sec";
      const t = document.createElement("div");
      t.className = "mist-msb-sec-t";
      t.textContent = title;
      const grid = document.createElement("div");
      grid.className = "mist-msb-grid";
      for (const it of this.msbSort(list)) {
        this._msbIndex[it.id] = it;
        grid.appendChild(this.msbMakeCell(it, editing, hidden.indexOf(it.id) >= 0));
      }
      sec.appendChild(t);
      sec.appendChild(grid);
      body.appendChild(sec);
    };
    addSec("思源自带", panels);
    if (pluginPages.length) addSec("插件 · 使用页", pluginPages);
    else {
      /* 空着也要说一句，否则看着像「插件页一个都没采到 = 坏了」 */
      const hint = document.createElement("div");
      hint.className = "mist-msb-sec-t";
      hint.textContent = "插件 · 使用页：没采到入口（该插件可能只注册了命令）";
      body.appendChild(hint);
    }
    addSec("插件 · 设置页", pluginSettings);

    if (!body.children.length) {
      const empty = document.createElement("div");
      empty.className = "mist-msb-sec-t";
      empty.textContent = "没有可显示的项目";
      body.appendChild(empty);
    }
  }

  msbMakeCell(it, editing, isHidden) {
    const cell = document.createElement("div");
    cell.className = "mist-msb-cell";
    cell.setAttribute("data-id", it.id);

    const ico = document.createElement("div");
    ico.className = "mist-msb-ico";
    if (it.iconUrl) {
      /* 插件用自家 icon.png；加载失败退回通用图标，别留个破图 */
      const img = document.createElement("img");
      img.alt = "";
      img.src = it.iconUrl;
      img.addEventListener("error", () => {
        if (img.parentNode) img.parentNode.innerHTML = '<svg><use xlink:href="#iconPlugin"></use></svg>';
      });
      ico.appendChild(img);
    } else {
      ico.innerHTML = '<svg><use xlink:href="#' + (it.icon || "iconMore") + '"></use></svg>';
    }

    const lb = document.createElement("div");
    lb.className = "mist-msb-lb";
    lb.textContent = it.label || "";

    cell.appendChild(ico);
    cell.appendChild(lb);

    if (editing) {
      if (isHidden) cell.setAttribute("data-hidden", "1");
      const badge = document.createElement("span");
      badge.className = "mist-msb-badge";
      badge.textContent = isHidden ? "+" : "−";
      badge.addEventListener("pointerdown", (e) => e.stopPropagation());
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        this.msbToggleHidden(it.id);
      });
      cell.appendChild(badge);
    }
    return cell;
  }

  /* ---------- 交互：点击跳转 / 长按进编辑 / 编辑态拖拽排序 ---------- */

  msbBindEvents() {
    const root = this._msb;
    const body = this._msbBody;
    if (!root || !body) return;

    const scrim = root.querySelector(".mist-msb-scrim");
    if (scrim) scrim.addEventListener("click", () => this.toggleMobileSidebar(false));

    const x = root.querySelector(".mist-msb-x");
    if (x) x.addEventListener("click", () => this.toggleMobileSidebar(false));

    /* 头部齿轮 = 面板外观（宽度/圆角/列数/磨砂/底色/把手/贴边/位置）。
       主题设置在格子里那份「薄雾设置」，两条入口不混。 */
    const look = root.querySelector(".mist-msb-look");
    if (look) {
      look.addEventListener("click", () => {
        this._msbMode = this._msbMode === "look" ? "grid" : "look";
        if (this._msbMode === "grid" && this._msbEdit) this.msbExitEdit();
        if (this._msbMode === "grid") this.renderMobileItems();
        else this.msbRenderLook();
      });
    }

    const done = root.querySelector(".mist-msb-done");
    if (done) done.addEventListener("click", () => this.msbExitEdit());

    let timer = 0;
    let sx = 0;
    let sy = 0;
    let suppress = false;
    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
      }
    };

    body.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".mist-msb-badge")) return;
      const cell = e.target.closest(".mist-msb-cell");
      if (!cell) return;
      sx = e.clientX;
      sy = e.clientY;
      suppress = false;
      if (this._msbEdit) {
        /* 编辑态：按住就能拖（要移动 6px 才算拖动，轻点不会误排序） */
        suppress = true;
        this.msbStartDrag(cell, e.clientX, e.clientY);
        return;
      }
      clearTimer();
      timer = setTimeout(() => {
        timer = 0;
        suppress = true;
        this.msbEnterEdit();
        /* 这里刻意不接着拖：进编辑态要整页重绘（隐藏项得画出来、角标得加上），
           手指按着的那个节点已经被换掉，后续 touchmove 的目标是「已脱离文档的旧节点」，
           冒不到 document 上 —— 0.2.22 之前接着拖的做法必然半路失效。
           所以走「长按 → 松手 → 再按住拖」，也是 iOS 桌面那套手感。 */
      }, 460);
    });

    /* 手指动了说明是想滚动，撤掉长按 */
    body.addEventListener("pointermove", (e) => {
      if (!timer) return;
      if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) clearTimer();
    });
    body.addEventListener("pointerup", clearTimer);
    body.addEventListener("pointercancel", clearTimer);

    body.addEventListener("click", (e) => {
      if (e.target.closest(".mist-msb-badge")) return;
      const lookChip = e.target.closest(".mist-msb-chip");
      if (lookChip) {
        this.msbPickLook(lookChip);
        return;
      }
      /* 外观页「显示哪些项目」的开关（0.2.21）。
         就地切，不整页重绘 —— 手指刚点完页面不能跳。 */
      const tgl = e.target.closest(".mist-msb-tgl");
      if (tgl) {
        const id = tgl.getAttribute("data-tgl");
        if (id) {
          const st = this.msbState();
          const i = st.hidden.indexOf(id);
          if (i < 0) st.hidden.push(id);
          else st.hidden.splice(i, 1);
          this.saveState();
          const off = st.hidden.indexOf(id) >= 0;
          tgl.classList.toggle("off", off);
          tgl.classList.toggle("on", !off);
        }
        return;
      }
      const cell = e.target.closest(".mist-msb-cell");
      if (!cell) return;
      if (suppress || this._msbEdit) {
        suppress = false;
        return;
      }
      const it = this._msbIndex[cell.getAttribute("data-id")];
      if (it) this.onMobileItemClick(it);
    });
  }

  /* 编辑态拖拽排序。
     🔴 为什么不能只用 pointermove：面板 body 是 overflow-y:auto 的可滚动容器，
        Android WebView 一判定这是「滚动手势」就停发 pointermove（只补一个 pointercancel），
        所以 0.2.22 那种纯 pointer 的写在真机上「按下去能进编辑态、但一点都拖不动」。
     现在：touch 事件为主（passive:false + preventDefault 把滚动手势抢回来），
        pointer 事件留给桌面/浏览器当备用通道；两条路按坐标去重，不会互相打架。 */
  msbStartDrag(el, x0, y0) {
    if (!el || !el.parentNode) return;
    this.msbEndDrag(true); /* 上一次没收到 up/cancel 的残留先清掉 */
    const st = {
      el: el,
      sx: typeof x0 === "number" ? x0 : 0,
      sy: typeof y0 === "number" ? y0 : 0,
      lx: Number.NaN,
      ly: Number.NaN,
      moved: false,
      off: [],
      timer: 0,
    };
    this._msbDrag = st;

    const move = (x, y) => {
      if (!st.moved) {
        /* 6px 死区：轻点（想点开某项）不能把顺序打乱 */
        if (Math.abs(x - st.sx) < 6 && Math.abs(y - st.sy) < 6) return;
        st.moved = true;
        el.classList.add("mist-msb-dragging");
        try {
          if (navigator.vibrate) navigator.vibrate(8);
        } catch (e) {
          /* 有些 WebView 禁震动，忽略 */
        }
      }
      if (x === st.lx && y === st.ly) return; /* touch 与 pointer 双通道去重 */
      st.lx = x;
      st.ly = y;
      const under = document.elementFromPoint(x, y);
      const target = under && under.closest ? under.closest(".mist-msb-cell") : null;
      if (!target || target === el) return;
      /* 只在同一个 grid 里换位：三个分区是固定的，跨区拖没有语义 */
      if (target.parentNode !== el.parentNode) return;
      const r = target.getBoundingClientRect();
      const after = x > r.left + r.width / 2;
      const ref = after ? target.nextSibling : target;
      if (ref === el || el.nextSibling === ref) return;
      el.parentNode.insertBefore(el, ref);
    };

    const onPointer = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      move(ev.clientX, ev.clientY);
    };
    const onTouch = (ev) => {
      const t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]);
      if (!t) return;
      if (ev.cancelable) ev.preventDefault();
      move(t.clientX, t.clientY);
    };
    const end = () => this.msbEndDrag(false);

    const bind = (type, fn) => {
      document.addEventListener(type, fn, { passive: false, capture: true });
      st.off.push([type, fn]);
    };
    bind("touchmove", onTouch);
    bind("touchend", end);
    bind("touchcancel", end);
    bind("pointermove", onPointer);
    bind("pointerup", end);
    bind("pointercancel", end);

    /* 手指滑出屏幕之类导致 up/cancel 都收不到时，别让格子永远半透明 */
    st.timer = setTimeout(() => this.msbEndDrag(false), 20000);
  }

  msbEndDrag(silent) {
    const st = this._msbDrag;
    if (!st) return;
    this._msbDrag = null;
    if (st.timer) clearTimeout(st.timer);
    st.off.forEach((pair) => document.removeEventListener(pair[0], pair[1], true));
    st.el.classList.remove("mist-msb-dragging");
    if (!silent && st.moved) this.msbCommitOrder();
  }

  onMobileItemClick(it) {
    if (!it || this._msbEdit) return; /* 编辑态点格子不跳转，避免误触 */
    this.toggleMobileSidebar(false);

    /* ① 侧栏页面：等面板收起再拉抽屉，两个动画错开，不然右边同时滑两下 */
    if (it.kind === "panel") {
      window.setTimeout(() => {
        const ok = this.openSidePanel(it.side, it.type);
        if (!ok && typeof showMessage === "function") showMessage("这个入口当前打不开", 2000, "info");
      }, 180);
      return;
    }

    /* ② 插件顶栏按钮 */
    if (it.kind === "topbarBtn") {
      if (it.el) {
        try {
          it.el.click();
        } catch (e) {
          console.warn("[mist-enhancer] 点击插件按钮失败", e);
        }
      }
      return;
    }

    /* ③ 插件命令 */
    if (it.kind === "command") {
      try {
        if (it.cmd && typeof it.cmd.callback === "function") it.cmd.callback();
        else if (typeof showMessage === "function") showMessage("命令不可执行", 2000, "info");
      } catch (e) {
        console.warn("[mist-enhancer] 执行插件命令失败", e);
      }
      return;
    }

    /* ④ 插件设置页 */
    if (it.kind === "pluginSetting") {
      if (it.name === this.name) {
        this.openSettings();
        return;
      }
      const p = this.app && this.app.plugins ? this.app.plugins[it.name] : null;
      if (!p) return;
      try {
        if (typeof p.openSetting === "function") p.openSetting();
        else if (p.setting) p.setting.open(pluginLabelOf(p) || it.name);
        else if (typeof showMessage === "function") showMessage("该插件没有设置页", 2000, "info");
      } catch (e) {
        console.warn("[mist-enhancer] 打开插件设置失败", it.name, e);
      }
    }
  }

  /* 打开左右抽屉里的某个页面。
     完全照思源移动端自己的实现（mobile/main.js 里那段）：
       1. [data-type="sidebar-<短名>-tab"] 最近的 .side-panel 才是容器
       2. 先把另一个抽屉的 inline transform 清空，避免左右同时开
       3. 容器 transform = translateX(0px) 拉出来
       4. 把 CustomEvent("click", {detail: 短名}) 派给容器的**第一个子元素**
     第 4 步是关键：思源的侧栏页不是听 tab 按钮的 click 切换，
     而是听 .side-panel 首个子元素上带 detail 的 click。
     上一版直接给 tab 按钮派发 MouseEvent，思源那边没人接 —— 所以点了没反应。 */
  openSidePanel(side, type) {
    const btn = document.querySelector('[data-type="' + type + '"]');
    if (btn && btn.classList.contains("fn__none")) return false;

    const fallback = document.getElementById(side === "left" ? "sidebar" : "sidebarRight");
    const panel = (btn && btn.closest(".side-panel")) || fallback;
    if (!panel) return false;

    /* 另一个抽屉先收起来 */
    const all = document.querySelectorAll("#sidebar, #sidebarRight");
    for (let i = 0; i < all.length; i++) {
      if (all[i] !== panel) all[i].style.transform = "";
    }
    panel.style.transform = "translateX(0px)";

    /* short = outline / backlink / bookmark / file / tag / inbox / agent
       插件页面的 data-type 不一定是 sidebar-xxx-tab，原样当 detail 传过去 */
    const short = type.replace(/^sidebar-/, "").replace(/-tab$/, "");
    const head = panel.firstElementChild;
    if (head) {
      try {
        head.dispatchEvent(new CustomEvent("click", { detail: short }));
      } catch (e) {
        console.warn("[mist-enhancer] 侧栏切页失败", type, e);
      }
    }
    /* 插件注册的侧栏页未必走思源那套 detail 分发，tab 按钮自己也补一下；
       严格形如 sidebar-xxx-tab 的内置页不用补（思源已经接住了）。 */
    if (btn && !/^sidebar-[a-z]+-tab$/.test(type)) {
      try {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      } catch (e) {
        try {
          btn.click();
        } catch (er) {
          /* ignore */
        }
      }
    }
    return true;
  }

  /* ---------- 把手：点击展开、上下拖动停位、左右拖动切边 ----------
     事件策略（上一版就栽在这里）：
       只用 pointer 事件 + setPointerCapture，然后靠 pointerup 判 moved。
       老 WebView / 被思源手势抢走 pointer 序列时 pointerup 不来，
       把手就永远「点了没反应」。所以改成 touch 为主、click 兜底：
         touchstart  不拦截（保持页面正常滚动）
         touchmove   超过 8px 才认轴，认了以后才 preventDefault + 阻止冒泡
         touchend    没拖动 = 点击 → 直接 toggle，并 preventDefault 掐掉合成 click
         click       兜底，200ms 内已处理过就跳过（桌面端也走这条） */
  bindMobileHandle() {
    const h = this._msbHandle;
    if (!h) return;

    let dragging = false;
    let axis = null;
    let moved = false;
    let sx = 0;
    let sy = 0;
    let startTop = 0;
    let lastToggle = 0;

    const begin = (x, y) => {
      dragging = true;
      axis = null;
      moved = false;
      sx = x;
      sy = y;
      const r = h.getBoundingClientRect();
      startTop = r.top + r.height / 2;
      this._msbDragPosY = null;
    };

    /* 返回 true 表示这次手势已经被当成拖动，调用方应 preventDefault */
    const move = (x, y) => {
      if (!dragging) return false;
      const dx = x - sx;
      const dy = y - sy;
      if (!axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        moved = true;
        h.classList.add("mist-msb-dragging");
      }
      if (axis === "y") {
        const vh = window.innerHeight;
        const cy = Math.max(60, Math.min(vh - 60, startTop + dy));
        h.style.top = cy + "px";
        h.style.transform = "translateY(-50%)";
        this._msbDragPosY = Math.round((cy / vh) * 100);
        return true;
      }
      if (axis === "x") {
        const side = x < window.innerWidth / 2 ? "left" : "right";
        if (this._msb.getAttribute("data-side") !== side) {
          this._msb.setAttribute("data-side", side);
          this.msbState().side = side;
        }
        return true;
      }
      return false;
    };

    /* 返回 true 表示这是一次点击（调用方负责展开面板） */
    const finish = () => {
      if (!dragging) return false;
      dragging = false;
      h.classList.remove("mist-msb-dragging");
      const wasMoved = moved;
      if (wasMoved) {
        if (this._msbDragPosY != null) {
          this.msbState().posY = this._msbDragPosY;
          this._msbDragPosY = null;
        }
        this.saveState();
        return false;
      }
      return true;
    };

    const openByClick = () => {
      const now = Date.now();
      if (now - lastToggle < 260) return; /* touch 已处理过，别再 toggle 回去 */
      lastToggle = now;
      this.toggleMobileSidebar();
    };

    /* ---- 触摸 ---- */
    h.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        begin(t.clientX, t.clientY);
      },
      { passive: true }
    );

    h.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        if (move(t.clientX, t.clientY)) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      { passive: false }
    );

    h.addEventListener(
      "touchend",
      (e) => {
        if (finish()) {
          /* 掐掉合成 click，避免和 click 兜底各 toggle 一次 */
          e.preventDefault();
          lastToggle = Date.now();
          this.toggleMobileSidebar();
        }
      },
      { passive: false }
    );

    h.addEventListener("touchcancel", () => {
      finish();
    });

    /* ---- 鼠标（桌面调试 / 触屏笔）：走 click 就够 ---- */
    h.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      begin(e.clientX, e.clientY);
    });
    h.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      if (move(e.clientX, e.clientY)) e.preventDefault();
    });
    h.addEventListener("mouseup", () => {
      finish();
    });

    /* ---- 兜底 ---- */
    h.addEventListener("click", (e) => {
      e.stopPropagation();
      openByClick();
    });
  }


  /* ---------------- 文档树图标 ---------------- */

  paintIcons() {
    if (!this.isMist()) return 0;
    const nb = this.state.icons.nb || ICON_NOTEBOOK;
    const doc = this.state.icons.doc || ICON_FILE;
    const map = {};
    map[ICON_NOTEBOOK] = nb;
    map[ICON_FOLDER] = doc;
    map[ICON_FILE] = doc;

    let n = 0;
    document.querySelectorAll(".file-tree .b3-list-item__icon").forEach((span) => {
      /* 带 aria-label = 思源的「修改图标」按钮 = 用户自己设过图标，绝不碰 */
      if (span.hasAttribute("aria-label")) return;
      const use = span.querySelector("svg > use");
      if (!use) return;
      const raw = use.getAttribute("xlink:href") || use.getAttribute("href") || "";
      const id = raw.replace(/^#/, "");
      const orig = use.getAttribute("data-mist-orig") || id;
      const target = map[orig];
      if (!target) return;
      if (!use.getAttribute("data-mist-orig")) use.setAttribute("data-mist-orig", orig);
      if (use.getAttribute("xlink:href") !== "#" + target) {
        use.setAttribute("xlink:href", "#" + target);
        use.setAttribute("href", "#" + target);
        n += 1;
      }
    });
    return n;
  }

  restoreIcons() {
    document.querySelectorAll(".file-tree .b3-list-item__icon svg > use[data-mist-orig]").forEach((use) => {
      const orig = use.getAttribute("data-mist-orig");
      if (orig) {
        use.setAttribute("xlink:href", "#" + orig);
        use.setAttribute("href", "#" + orig);
      }
      use.removeAttribute("data-mist-orig");
    });
  }

  /* ---------------- 浮动面板：动画触发 ----------------
     为什么是轮询而不是 MutationObserver：面板显隐只改 inline style，
     MutationObserver 得挂在整棵 #layouts 子树上监听所有元素的 style 变化，
     编辑器一滚动就是几百条记录，纯属浪费。这里每 150ms 读一次 inline opacity，
     开销不到一次 getComputedStyle。 */
  watchFloatDock() {
    this.unwatchFloatDock();
    const f = this.state.float || {};
    if (!this.isMist() || !f.enable || f.anim === "none") return;
    const seen = new WeakMap();
    this._floatTimer = setInterval(() => {
      const list = document.querySelectorAll(".layout--float");
      for (let i = 0; i < list.length; i += 1) {
        const el = list[i];
        const on = el.style.opacity === "1";
        if (on && seen.get(el) !== true) this.playFloatAnim(el);
        seen.set(el, on);
      }
    }, 150);
  }

  unwatchFloatDock() {
    if (this._floatTimer) {
      clearInterval(this._floatTimer);
      this._floatTimer = 0;
    }
  }

  /* 重播弹出动画：移除 class → 强制回流 → 再加回去。
     外壳类动画（fade/veil）挂在 .layout--float 本身；
     位移/缩放类必须挂在内容层，碰外壳的 transform 会把面板推错位。 */
  playFloatAnim(el) {
    const f = this.state.float || {};
    if (!f.enable || !f.anim || f.anim === "none") return;
    const shell = f.anim === "fade" || f.anim === "veil";
    const target = shell ? el : el.querySelector(":scope > .fn__flex-1.fn__flex");
    if (!target) return;
    target.classList.remove("mist-float-pop");
    void target.offsetWidth;
    target.classList.add("mist-float-pop");
  }

  /* 设置面板里的「播放一次」：没在浮动布局就提示，而不是静默失败 */
  previewFloatAnim() {
    const el = document.querySelector(".layout__dockl.layout--float");
    if (!el) {
      showMessage("当前没有浮动的侧边面板：先把鼠标移到面板上让它浮出来，再点播放", 3200, "info");
      return;
    }
    try {
      window.siyuan.layout.leftDock.showDock();
    } catch (e) {
      /* 可能没有 active 停靠项，动画照样能播 */
    }
    setTimeout(() => this.playFloatAnim(el), 80);
  }

  /* ---------------- 图标库 ---------------- */

  /* 直接枚举页面上已有的 symbol —— 思源的图标包 icon.js 就是
     document.body.insertAdjacentHTML 把 <svg id="iconsXxx"><defs><symbol> 插进 DOM，
     所以这里一行都不用打包图标资源。 */
  listIcons() {
    const out = [];
    const seen = new Set();
    document.querySelectorAll('svg[id^="icons"] symbol').forEach((sym) => {
      const id = sym.getAttribute("id") || "";
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push(id);
    });
    out.sort();
    return out;
  }

  /* ---------------- 设置面板 ---------------- */

  /* 明暗两套值是分开存的：编辑「浅色」那一套时，若当前界面是暗色，
     改动不会显示出来（0.2.20 起在模式条上明说，避免又出现
     「怎么拖都没反应 → 以为主题坏了」的误判）。 */
  modeHintHtml() {
    const nameOf = (m) => (m === "dark" ? "暗色" : "浅色");
    const cur = this.modeKey();
    const edit = this.editMode === "dark" ? "dark" : "light";
    const same = cur === edit;
    return (
      `<span class="mist-mode-hint${same ? "" : " warn"}" id="mistModeHint">` +
      `正在编辑 <b>${nameOf(edit)}</b> 那一套` +
      (same
        ? ` · 与当前界面一致，改动即时可见`
        : ` · 当前界面是 <b>${nameOf(cur)}</b>，这里的改动<b>不会</b>显示出来`) +
      `</span>`
    );
  }

  refreshModeHint(root) {
    const box = root || (this._dlg && this._dlg.element);
    if (!box) return;
    const el = box.querySelector("#mistModeHint");
    if (!el) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = this.modeHintHtml();
    const nw = tmp.firstElementChild;
    if (nw) el.replaceWith(nw);
  }

  openDialog() {
    if (this._dlg) {
      try {
        this._dlg.destroy();
      } catch (e) {
        /* ignore */
      }
      this._dlg = null;
    }
    this.editMode = this.modeKey();
    /* 手机上 Dialog 是全屏的：写死 900×640 会横向溢出、底部被裁。
       这里按前端切尺寸，布局细节交给 dialogCss 里的 data-mist-mobile 那一段。 */
    const mob = this._mobileOnly || this.isMobile();
    const dlg = new Dialog({
      title: this.i18n.pluginName || "薄雾设置",
      content: this.dialogHtml(),
      width: mob ? "100%" : "900px",
      height: mob ? "100%" : "640px",
      destroyCallback: () => {
        this._dlg = null;
      },
    });
    this._dlg = dlg;
    const body = dlg.element.querySelector(".b3-dialog__body");
    if (body) body.style.padding = "0";
    this.bindDialog(dlg.element);
    return dlg;
  }

  dialogHtml() {
    const i18n = this.i18n || {};
    const tabs = [
      ["look", i18n.tabLook || "外观"],
      ["color", i18n.tabColor || "颜色与透明"],
      ["bg", i18n.tabBg || "背景图"],
      ["float", i18n.tabFloat || "浮动面板"],
      ["font", i18n.tabFont || "字体"],
      ["icon", i18n.tabIcon || "文档树图标"],
      ["about", i18n.tabAbout || "关于"],
    ];
    const nav = tabs
      .map(([k, label], i) => `<button data-tab="${k}"${i === 0 ? ' class="on"' : ""}>${label}</button>`)
      .join("");

    const dark = this.isDark();
    const editDark = this.editMode === "dark";
    return `
<div class="mist-dlg">
  <button class="mist-close" title="收起设置面板" aria-label="收起设置面板">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
  </button>
  <nav class="mist-nav">${nav}</nav>
  <div class="mist-main">
    <div class="mist-mode">
      <button data-mode="light"${editDark ? "" : ' class="on"'}>浅色</button>
      <button data-mode="dark"${editDark ? ' class="on"' : ""}>暗色</button>
      ${this.modeHintHtml()}
    </div>

    <div class="mist-pane on" id="pane-look">
      <div class="mist-grp">预设</div>
      <div class="mist-row">
        <span class="mist-lb">一键套用</span>
        <span class="mist-ctl" id="mistPresets"></span>
      </div>
      <div class="mist-hint">预设会同时写入浅色和暗色两套值，之后仍可随手微调。</div>
      <div class="mist-grp">全局对比度</div>
      <div class="mist-row">
        <span class="mist-lb">文字对比度</span>
        <span class="mist-ctl">
          <input class="mist-range" type="range" min="0" max="100" step="1" data-k="contrast">
          <span class="mist-num" data-v="contrast"></span>
        </span>
      </div>
      <div class="mist-hint">50 = 主题默认。调低文字会往背景色靠（更柔和但更难读），调高会往纯黑/纯白靠。只影响文字，不动背景。</div>
      <div class="mist-sep"></div>
      <div class="mist-grp">表格宽度</div>
      <div class="mist-row">
        <span class="mist-lb">自适应编辑器宽</span>
        <span class="mist-ctl">
          <input type="checkbox" class="b3-check" data-bool="tableFit">
          <span class="mist-hint" style="margin:0">表格宽度不超过编辑区：超出时按列比例缩到编辑区宽；内容少时仍保持窄、不拉伸</span>
        </span>
      </div>
      <div class="mist-sep"></div>
      <div class="mist-grp">当前状态</div>
      <div class="mist-about" id="mistStatus"></div>
    </div>

    <div class="mist-pane" id="pane-color">
      <div class="mist-hint">透明度 100% = 实色（看不见背景图），0% = 完全透出背后的图。四个区域各自独立。</div>
      <div class="mist-grp">目录 + 左侧停靠栏</div>
      <div class="mist-row">
        <span class="mist-lb">颜色</span>
        <span class="mist-ctl"><span class="mist-sw" data-sw="sideColor" title="点一下在下方展开取色器"></span><span class="mist-num" data-v="sideColor"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">透明度</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="0" max="100" step="1" data-k="sideAlpha"><span class="mist-num" data-v="sideAlpha"></span></span>
      </div>
      <div class="mist-grp">编辑区 + 标签页</div>
      <div class="mist-row">
        <span class="mist-lb">颜色</span>
        <span class="mist-ctl"><span class="mist-sw" data-sw="editorColor" title="点一下在下方展开取色器"></span><span class="mist-num" data-v="editorColor"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">透明度</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="0" max="100" step="1" data-k="editorAlpha"><span class="mist-num" data-v="editorAlpha"></span></span>
      </div>
      <div class="mist-grp">顶部工具栏</div>
      <div class="mist-row">
        <span class="mist-lb">颜色</span>
        <span class="mist-ctl"><span class="mist-sw" data-sw="topColor" title="点一下在下方展开取色器"></span><span class="mist-num" data-v="topColor"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">透明度</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="0" max="100" step="1" data-k="topAlpha"><span class="mist-num" data-v="topAlpha"></span></span>
      </div>
      <div class="mist-grp">右侧玻璃面板</div>
      <div class="mist-row">
        <span class="mist-lb">颜色</span>
        <span class="mist-ctl"><span class="mist-sw" data-sw="dockColor" title="点一下在下方展开取色器"></span><span class="mist-num" data-v="dockColor"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">透明度</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="0" max="100" step="1" data-k="dockAlpha"><span class="mist-num" data-v="dockAlpha"></span></span>
      </div>
    </div>

    <div class="mist-pane" id="pane-bg">
      <div class="mist-grp">场景预设（点击直接套用，不用上传）</div>
      <div class="mist-hint">内置底图，点一下就铺成笔记背景。亮色科技图配合「颜色与透明」里调低区域透明度更出彩；暗色下深色底图更协调。底部「彩」即默认多彩渐变。</div>
      <div id="mistScenes" class="mist-scenes"></div>
      <div class="mist-grp">当前背景图</div>
      <div class="mist-thumb" id="mistThumb"></div>
      <div class="mist-row" style="padding-top:0">
        <span class="mist-lb"></span>
        <span class="mist-ctl">
          <button class="mist-btn primary" data-act="pickBg">选择图片</button>
          <button class="mist-btn" data-act="clearBg">移除</button>
          <input type="file" accept="image/*" data-act="bgFile" style="display:none">
        </span>
      </div>
      <div class="mist-grp">作用范围</div>
      <div class="mist-row">
        <span class="mist-lb">铺到哪</span>
        <span class="mist-ctl">
          <select class="b3-select" data-k="bgScope" style="width:180px">
            <option value="window">整个界面（含顶栏、侧边栏）</option>
            <option value="editor">仅编辑区</option>
          </select>
        </span>
      </div>
      <div class="mist-grp">铺法</div>
      <div class="mist-row">
        <span class="mist-lb">缩放</span>
        <span class="mist-ctl">
          <select class="b3-select" data-k="bgFit" style="width:180px">
            <option value="cover">填充铺满</option>
            <option value="contain">完整显示</option>
            <option value="repeat">平铺</option>
          </select>
        </span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">位置</span>
        <span class="mist-ctl">
          <select class="b3-select" data-k="bgPos" style="width:180px">
            <option value="center">居中</option>
            <option value="top">靠上</option>
            <option value="bottom">靠下</option>
          </select>
        </span>
      </div>
      <div class="mist-hint">自己上传的图会压到 1920px 宽并转 JPEG 存进 data.json，避免跟着云同步来回传。要看见图，需把「颜色与透明」里对应区域的透明度调低。</div>
    </div>

    <div class="mist-pane" id="pane-float">
      <div class="mist-hint">浮动布局 = 侧边面板<b>取消固定</b>后压在编辑区之上的浮层（面板右上角的图钉）。这里管它的玻璃外观与弹出动画，左侧文档树、右侧面板都适用。</div>
      <div class="mist-row">
        <span class="mist-lb">启用玻璃效果</span>
        <span class="mist-ctl">
          <input type="checkbox" class="b3-check" data-fk="enable">
          <span class="mist-hint" style="margin:0">关掉就完全交还给思源原生外观</span>
        </span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">标题栏图钉</span>
        <span class="mist-ctl">
          <input type="checkbox" class="b3-check" data-fk="pinBtn">
          <span class="mist-hint" style="margin:0">浮动面板的标题栏右端放一个图钉：点一下把面板钉住（这一次不再随鼠标移开收起），再点一下松钉。布局仍然是浮动，玻璃外观不变</span>
        </span>
      </div>
      <div class="mist-grp">玻璃</div>
      <div class="mist-row">
        <span class="mist-lb">圆角</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="0" max="32" step="1" data-k="floatRadius"><span class="mist-num" data-v="floatRadius"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">模糊</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="0" max="40" step="1" data-k="floatBlur"><span class="mist-num" data-v="floatBlur"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">饱和度</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="100" max="220" step="5" data-k="floatSat"><span class="mist-num" data-v="floatSat"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">不透明度</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="5" max="100" step="1" data-k="floatAlpha"><span class="mist-num" data-v="floatAlpha"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">阴影强度</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="0" max="60" step="1" data-k="floatShadow"><span class="mist-num" data-v="floatShadow"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">外间距</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="0" max="28" step="1" data-k="floatGap"><span class="mist-num" data-v="floatGap"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">磨砂颗粒</span>
        <span class="mist-ctl">
          <input type="checkbox" class="b3-check" data-fk="grain">
          <span class="mist-hint" style="margin:0">叠一层噪点，比纯模糊更像毛玻璃</span>
        </span>
      </div>
      <div class="mist-hint">「外间距」是面板离窗口上下的留白；离左边最多只能到 6px —— 思源收起面板时的位移是写死的，超过会出现一条露边。</div>
      <div class="mist-sep"></div>
      <div class="mist-grp">弹出动画</div>
      <div class="mist-row">
        <span class="mist-lb">方案</span>
        <span class="mist-ctl">
          <select class="b3-select" data-k="floatAnim" style="width:auto;min-width:200px">
            ${FLOAT_ANIMS.map((a) => `<option value="${a.key}">${a.name}</option>`).join("")}
          </select>
        </span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">时长</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="80" max="700" step="10" data-k="floatDur"><span class="mist-num" data-v="floatDur"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">缓动曲线</span>
        <span class="mist-ctl">
          <select class="b3-select" data-k="floatEase" style="width:auto;min-width:210px">
            ${FLOAT_EASES.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}
          </select>
        </span>
      </div>
      <div class="mist-row">
        <span class="mist-lb"></span>
        <span class="mist-ctl"><button class="mist-btn primary" data-act="previewFloat">▶ 播放一次</button></span>
      </div>
      <div class="mist-hint" id="mistFloatHint"></div>
      <div class="mist-hint">动画由插件在检测到面板浮出时补一次 class 触发：思源的浮动面板是靠改 inline style 显示/隐藏的，纯 CSS 动画不会被自动重播，这是唯一的挂法。位移类动画都作用在面板内部的内容层，绝不动外层的 transform —— 那个位移负责把面板推到图标栏右边，动了就会错位。</div>
    </div>

    <div class="mist-pane" id="pane-font">
      <div class="mist-grp">正文</div>
      <div class="mist-row">
        <span class="mist-lb">字体</span>
        <span class="mist-ctl">
          <input class="b3-text-field fn__flex-1" type="text" placeholder="留空 = 思源默认" data-k="editorFont">
          <button class="mist-btn" style="flex:0 0 auto" data-act="pickFont" data-fontk="editorFont">选择</button>
        </span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">字号</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="12" max="28" step="0.5" data-k="editorSize"><span class="mist-num" data-v="editorSize"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">字重</span>
        <span class="mist-ctl"><input class="b3-text-field" type="number" min="100" max="900" step="10" data-k="editorWeight" style="width:88px"><span class="mist-num" data-v="editorWeight"></span></span>
      </div>
      <div class="mist-grp">文档树</div>
      <div class="mist-row">
        <span class="mist-lb">字体</span>
        <span class="mist-ctl">
          <input class="b3-text-field fn__flex-1" type="text" placeholder="留空 = 思源默认" data-k="treeFont">
          <button class="mist-btn" style="flex:0 0 auto" data-act="pickFont" data-fontk="treeFont">选择</button>
        </span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">字号</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="10" max="22" step="0.5" data-k="treeSize"><span class="mist-num" data-v="treeSize"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">字重</span>
        <span class="mist-ctl"><input class="b3-text-field" type="number" min="100" max="900" step="10" data-k="treeWeight" style="width:88px"><span class="mist-num" data-v="treeWeight"></span></span>
      </div>

      <div class="mist-grp">多级标题</div>
      <div class="mist-row">
        <span class="mist-lb">字重</span>
        <span class="mist-ctl"><input class="b3-text-field" type="number" min="100" max="900" step="10" data-k="headingWeight" style="width:88px"><span class="mist-num" data-v="headingWeight"></span></span>
      </div>
      <div class="mist-hint">H1–H6 统一字重。思源默认 600，比正文重、层级靠字号区分。填 530 左右更细；想按层级分别设暂不支持，先统一一个值。</div>

      <div class="mist-fontpick" data-fontpick>
        <div class="mist-picker-top">
          <input class="b3-text-field" type="text" placeholder="搜索字体名" data-fsearch>
          <span class="mist-num" style="width:auto" data-fcount></span>
        </div>
        <div class="mist-fontlist" data-flist></div>
      </div>

      <div class="mist-grp">文档标题</div>
      <div class="mist-row">
        <span class="mist-lb">字号</span>
        <span class="mist-ctl"><input class="mist-range" type="range" min="16" max="46" step="0.5" data-k="titleSize"><span class="mist-num" data-v="titleSize"></span></span>
      </div>
      <div class="mist-row">
        <span class="mist-lb">字重</span>
        <span class="mist-ctl"><input class="b3-text-field" type="number" min="100" max="900" step="10" data-k="titleWeight" style="width:88px"><span class="mist-num" data-v="titleWeight"></span></span>
      </div>
      <div class="mist-hint">标题字号独立于正文，改正文不会带着标题一起变。字体名带空格会自动加引号，多个字体可用英文逗号分隔。点「选择」可从<b>本机已安装字体</b>里挑（列表可上下滚动，每行用字体自身显示），也可以直接手打字体名。字重缺省 600（思源原生半粗档），想更细可填 400–550 之间的数（需本机字体为可变字体才显中间档）。</div>
    </div>

    <div class="mist-pane" id="pane-icon">
      <div class="mist-hint">只替换<b>没有单独设过图标</b>的条目。你自己换过图标的文档会保持原样，点图标仍然能正常换。</div>
      <div class="mist-grp">笔记本默认图标</div>
      <div class="mist-row">
        <span class="mist-lb">图标</span>
        <span class="mist-ctl">
          <span class="mist-icon-cur" data-cur="nb"></span>
          <button class="mist-btn" data-act="openPicker" data-pick="nb">选择</button>
        </span>
      </div>
      <div class="mist-picker" data-picker="nb">
        <div class="mist-picker-top">
          <input class="b3-text-field" type="text" placeholder="搜索图标名，例如 book" data-icsearch="nb">
          <span class="mist-num" style="width:auto" data-iccount="nb"></span>
        </div>
        <div class="mist-grid" data-grid="nb"></div>
      </div>
      <div class="mist-grp">文档默认图标</div>
      <div class="mist-row">
        <span class="mist-lb">图标</span>
        <span class="mist-ctl">
          <span class="mist-icon-cur" data-cur="doc"></span>
          <button class="mist-btn" data-act="openPicker" data-pick="doc">选择</button>
        </span>
      </div>
      <div class="mist-picker" data-picker="doc">
        <div class="mist-picker-top">
          <input class="b3-text-field" type="text" placeholder="搜索图标名，例如 file" data-icsearch="doc">
          <span class="mist-num" style="width:auto" data-iccount="doc"></span>
        </div>
        <div class="mist-grid" data-grid="doc"></div>
      </div>
      <div class="mist-hint" id="mistIconStat"></div>
    </div>

    <div class="mist-pane" id="pane-about">
      <div class="mist-grp">状态</div>
      <div class="mist-about" id="mistAbout"></div>
      <div class="mist-sep"></div>
      <div class="mist-grp">操作</div>
      <div class="mist-row">
        <span class="mist-lb"></span>
        <span class="mist-ctl">
          <button class="mist-btn" data-act="resetAll">恢复本模式默认</button>
          <button class="mist-btn" data-act="exportCfg">导出设置</button>
          <button class="mist-btn" data-act="importCfg">导入设置</button>
          <input type="file" accept=".json" data-act="cfgFile" style="display:none">
        </span>
      </div>
      <div class="mist-sep"></div>
      <div class="mist-grp">说明</div>
      <div class="mist-about">
        <b>只在薄雾主题下工作。</b>判定依据是思源写在 <code>&lt;html&gt;</code> 上的
        <code>data-light-theme</code> / <code>data-dark-theme</code>；切到别的主题时，
        本插件写入的变量与图标替换会全部撤销，不留痕迹。<br><br>
        <b>静态外观留在主题里。</b>去框、磨砂、右侧悬浮条、面包屑透明这些都写在 theme.css，
        不装插件也完整。本插件只负责「需要面板和记忆」的部分。<br><br>
        <b>图标不打包。</b>选择器里列出的是你当前启用图标包的全部 symbol，
        直接从页面上的 <code>&lt;symbol&gt;</code> 读，插件体积不因图标变胖。
      </div>
    </div>
  </div>
</div>`;
  }

  bindDialog(root) {
    const state = this.state;
    const e = (sel) => root.querySelector(sel);
    const ea = (sel) => Array.from(root.querySelectorAll(sel));

    /* 面板右上角的 × （只在侧栏面板里显示，见 dialogCss 的 .mist-close） */
    const closeBtn = e(".mist-close");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeDockPanel());

    /* tab 切换 */
    ea(".mist-nav button").forEach((btn) => {
      btn.addEventListener("click", () => {
        ea(".mist-nav button").forEach((b) => b.classList.toggle("on", b === btn));
        const key = btn.getAttribute("data-tab");
        ea(".mist-pane").forEach((p) => p.classList.toggle("on", p.id === "pane-" + key));
        if (key === "icon") this.renderIconArea(root);
      });
    });

    /* 明暗编辑切换 */
    ea(".mist-mode button").forEach((btn) => {
      btn.addEventListener("click", () => {
        ea(".mist-mode button").forEach((b) => b.classList.toggle("on", b === btn));
        this.editMode = btn.getAttribute("data-mode");
        this.syncControls(root);
        /* 0.2.20：切到「不是当前界面」的那一套时，模式条要立刻说明
           「改了也不会显示」，否则很容易被当成主题没生效。 */
        this.refreshModeHint(root);
        this.renderStatus(root);
      });
    });

    /* 浮动面板的两个开关。checkbox 不走 [data-k] 那条路 ——
       那里的取值逻辑是 range/number 转数字、其余取 .value（checkbox 会拿到 "on"）。 */
    ea("[data-fk]").forEach((el) => {
      el.addEventListener("change", () => {
        state.float[el.getAttribute("data-fk")] = !!el.checked;
        this.apply();
        this.saveState();
      });
    });
    /* 顶层布尔开关（如「表格宽度自适应编辑器」）：写到 state[boolKey] */
    ea("[data-bool]").forEach((el) => {
      el.addEventListener("change", () => {
        state[el.getAttribute("data-bool")] = !!el.checked;
        this.apply();
        this.saveState();
      });
    });
    e('[data-act="previewFloat"]').addEventListener("click", () => this.previewFloatAnim());

    /* 数值控件（颜色不走这里，见下面自绘取色器） */
    ea("[data-k]").forEach((el) => {
      const k = el.getAttribute("data-k");
      const isRange = el.type === "range";
      el.addEventListener(isRange ? "input" : "change", () => {
        const val = isRange || el.type === "number" ? Number(el.value) : el.value;
        if (["sideAlpha", "editorAlpha", "dockAlpha", "topAlpha"].includes(k)) {
          state[this.editMode][k] = val;
        } else if (k === "bgFit" || k === "bgPos" || k === "bgScope") {
          const map = { bgFit: "fit", bgPos: "pos", bgScope: "scope" };
          state.bg[map[k]] = val;
        } else if (k === "contrast") {
          state.contrast = val;
        } else if (FLOAT_KMAP[k]) {
          /* floatRadius → state.float.radius */
          state.float[FLOAT_KMAP[k]] = val;
        } else {
          state.font[k] = val;
        }
        this.apply();
        this.syncLabels(root);
        this.saveState();
      });
    });

    /* 色块：点一下就在这一行下面展开取色器（见 openColorPicker） */
    ea("[data-sw]").forEach((sw) => {
      sw.addEventListener("click", () => this.openColorPicker(root, sw.getAttribute("data-sw"), sw));
    });

    const fileInput = e('[data-act="bgFile"]');
    e('[data-act="pickBg"]').addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      try {
        showMessage("正在处理图片…", 1500, "info");
        const dataUrl = await compressImage(f);
        state.bg.img = dataUrl;
        this.apply();
        this.renderThumb(root);
        this.saveState();
        showMessage("背景图已设置", 1800, "info");
      } catch (err) {
        showMessage("图片处理失败：" + (err && err.message ? err.message : ""), 3000, "error");
      } finally {
        fileInput.value = "";
      }
    });
    e('[data-act="clearBg"]').addEventListener("click", () => {
      state.bg.img = "";
      this.apply();
      this.renderThumb(root);
      this.saveState();
    });

    /* 图标选择器 */
    ea('[data-act="openPicker"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-pick");
        const box = e('[data-picker="' + key + '"]');
        const on = box.classList.toggle("on");
        if (on) this.renderIconGrid(root, key);
      });
    });
    ea("[data-icsearch]").forEach((inp) => {
      inp.addEventListener("input", () => this.renderIconGrid(root, inp.getAttribute("data-icsearch")));
    });

    /* 字体选择器（0.2.11）：点「选择」展开本机字体列表，点一项写回对应输入框。
       两个输入框共用一个列表面板，靠 this._fontTarget 记住在给谁挑。
       ⚠ 切换目标时不能简单 toggle：第一版就是 toggle，点另一个「选择」把面板
       收起不说，列表里绑的还是旧输入框（点一项写错框）。改成：同一个按钮再点
       一次 = 收起；换目标 = 保持展开 + 重画列表（重画才会把点击目标换成新框）。 */
    ea('[data-act="pickFont"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.getAttribute("data-fontk");
        const box = e("[data-fontpick]");
        const row = btn.closest(".mist-row");
        /* 两个「选择」共用同一个列表元素（面板里只有这一份）。
           0.2.11 把它写死在「文档树」那两行之后 —— 于是点「正文」的「选择」，
           列表也从文档树下面冒出来，离点的地方隔着一整节，看着像长在别的区域。
           现在点哪个就把它搬到哪一行下面，列表跟着目标走。 */
        if (row && box && box.previousElementSibling !== row) {
          row.insertAdjacentElement("afterend", box);
        }
        const same = this._fontTarget === k && box.classList.contains("on");
        this._fontTarget = k;
        if (same) {
          box.classList.remove("on");
          return;
        }
        box.classList.add("on");
        this.renderFontList(root);
        /* 面板本身可滚动，列表插入后可能在可视区外（尤其点上面那行时） */
        try {
          box.scrollIntoView({ block: "nearest" });
        } catch (err) {}
      });
    });
    e("[data-fsearch]").addEventListener("input", () => this.renderFontList(root));

    /* 关于页按钮 */
    e('[data-act="resetAll"]').addEventListener("click", () => {
      state[this.editMode] = clone(DEFAULT_STATE[this.editMode]);
      this.apply();
      this.syncControls(root);
      this.saveState();
      showMessage("已恢复当前模式默认值", 1600, "info");
    });
    e('[data-act="exportCfg"]').addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mist-enhancer-settings.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    const cfgFile = e('[data-act="cfgFile"]');
    e('[data-act="importCfg"]').addEventListener("click", () => cfgFile.click());
    cfgFile.addEventListener("change", () => {
      const f = cfgFile.files && cfgFile.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const obj = JSON.parse(String(fr.result || "{}"));
          const merged = mergeDeep(DEFAULT_STATE, obj);
          /* 不换对象引用：面板里所有控件闭包都持有 state，
             一旦换引用，后续编辑会写到旧对象上，表现为「改了没反应」。 */
          Object.keys(merged).forEach((k) => {
            state[k] = merged[k];
          });
          this.apply();
          this.syncControls(root);
          this.renderThumb(root);
          this.saveState();
          showMessage("设置已导入", 1800, "info");
        } catch (err) {
          showMessage("导入失败：不是有效的设置文件", 2600, "error");
        }
      };
      fr.readAsText(f);
      cfgFile.value = "";
    });

    this.syncControls(root);
    this.renderLookPresets(root);
    this.renderBgScenarios(root);
    this.renderThumb(root);
    this.renderStatus(root);
  }

  /* 外观 tab 的四套一键套用。
     注意方法名不能和别的 render 撞车 —— 上一版这里与背景图格子同名，
     后者覆盖了前者，结果「一键套用」永远是空的。 */
  renderLookPresets(root) {
    const box = root.querySelector("#mistPresets");
    if (!box) return;
    box.innerHTML = PRESETS.map(
      (p) => `<button class="mist-preset" data-preset="${esc(p.key)}">${esc(p.name)}</button>`
    ).join("");
    box.querySelectorAll(".mist-preset").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = PRESETS.find((x) => x.key === btn.getAttribute("data-preset"));
        if (!p) return;
        box.querySelectorAll(".mist-preset").forEach((b) => b.classList.toggle("on", b === btn));
        /* accent / line 必须显式覆盖：预设没带时要清成 ""，
           不能靠 Object.assign 的「没有这个键就不动」——那样红框和去线都会残留。
           line 只在预设顶层写（结构属性，不分浅暗），这里替两套一起填。 */
        this.state.light = Object.assign({}, this.state.light, p.light, {
          accent: presetAccent(p, "light"),
          line: p.line || "",
        });
        this.state.dark = Object.assign({}, this.state.dark, p.dark, {
          accent: presetAccent(p, "dark"),
          line: p.line || "",
        });
        this.apply();
        this.syncControls(root);
        this.saveState();
        showMessage("已套用「" + p.name + "」", 1400, "info");
      });
    });
    /* 重开面板时把当前这套点亮：靠 accent 认（只有 wolai 带色）不牢，
       改按「四区颜色 + accent」整体比对，能认出来就标上。 */
    const cur = this.state[this.editMode] || this.state.light;
    const hit = PRESETS.find((p) => {
      const t = p[this.editMode === "dark" ? "dark" : "light"] || {};
      const keys = ["sideColor", "editorColor", "dockColor", "topColor"];
      return keys.every((k) => String(t[k] || "").toLowerCase() === String(cur[k] || "").toLowerCase())
        && presetAccent(p, this.editMode === "dark" ? "dark" : "light") === String(cur.accent || "");
    });
    if (hit) {
      const b = box.querySelector('[data-preset="' + hit.key + '"]');
      if (b) b.classList.add("on");
    }
  }

  /* 背景场景预设：内置底图网格，点一下套用（写入 state.bg.img，复用背景应用链路）。 */
  renderBgScenarios(root) {
    const box = root.querySelector("#mistScenes");
    if (!box) return;
    box.innerHTML = BG_SCENES.map((s) =>
      `<div class="mist-scene" data-scene="${s.key}" title="${esc(s.name)}" style="background-image:url(&quot;${s.uri}&quot;)">` +
      `<span class="grp">${esc(s.group)}</span><span class="lb">${esc(s.name)}</span></div>`
    ).join("");
    const mark = () => {
      const cur = this.state.bg && this.state.bg.img;
      box.querySelectorAll(".mist-scene").forEach((el) => {
        const u = BG_SCENES.find((s) => s.key === el.getAttribute("data-scene"));
        el.classList.toggle("on", !!u && cur === u.uri);
      });
    };
    box.querySelectorAll(".mist-scene").forEach((el) => {
      el.addEventListener("click", () => {
        const s = BG_SCENES.find((x) => x.key === el.getAttribute("data-scene"));
        if (!s) return;
        this.state.bg.img = s.uri;
        this.state.bg.fit = "cover";
        this.state.bg.scope = "window";
        this.apply();
        this.syncControls(root);
        this.saveState();
        this.renderThumb(root);
        mark();
        showMessage("已套用「" + s.name + "」背景", 1400, "info");
      });
    });
    mark();
  }

  /* ---------------- 自绘取色器 ----------------
     为什么不用 input[type=color]：Electron 会拉起**系统取色面板**，固定在窗口
     左上角、压住文档树，而且不能拖动。鼠标在右边点色块、面板跑到左上角，改一
     个颜色眼睛要横跨整个窗口；在 232px 的侧栏里更离谱，直接盖住目录。
     所以改成：点色块 → 就在这一行下面展开，改完点「完成」收起。 */

  /* 取色器只建一份，在同一个 root 里换行复用；同时只开一个。 */
  ensureColorPicker(root) {
    let cp = root._mistCp;
    if (cp && document.contains(cp)) return cp;
    cp = document.createElement("div");
    cp.className = "mist-cp";
    cp.innerHTML = `
      <div class="mist-cp-sv"><span class="mist-cp-dot"></span></div>
      <div class="mist-cp-hue"><span class="mist-cp-hdot"></span></div>
      <div class="mist-cp-foot">
        <span class="mist-cp-prev"></span>
        <input class="b3-text-field mist-cp-hex" maxlength="7" spellcheck="false">
        <button class="mist-btn mist-cp-eye" title="从屏幕任意位置吸取颜色">吸管</button>
        <button class="mist-btn mist-cp-done">完成</button>
      </div>`;
    root.appendChild(cp);
    root._mistCp = cp;

    const sv = cp.querySelector(".mist-cp-sv");
    const hue = cp.querySelector(".mist-cp-hue");
    const hex = cp.querySelector(".mist-cp-hex");

    /* 拖动：按下就跟着走，不用按住移出去就断。setPointerCapture 保证
       指针离开方块后 pointermove 仍然打在这个元素上。 */
    const drag = (el, fn) => {
      el.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        try {
          el.setPointerCapture(ev.pointerId);
        } catch (err) {
          /* 老版本没有 pointer capture，退化成普通拖动 */
        }
        const move = (e2) => fn(e2);
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
        move(ev);
      });
    };
    drag(sv, (ev) => {
      const r = sv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      cp._s = clamp01((ev.clientX - r.left) / r.width);
      cp._v = 1 - clamp01((ev.clientY - r.top) / r.height);
      this.paintColorPicker(root, cp);
    });
    drag(hue, (ev) => {
      const r = hue.getBoundingClientRect();
      if (!r.width) return;
      cp._h = clamp01((ev.clientX - r.left) / r.width) * 360;
      this.paintColorPicker(root, cp);
    });

    /* hex 手输：打字时不要每个字符都改主题，失焦/回车才认 */
    hex.addEventListener("change", () => {
      const v = String(hex.value || "").trim();
      if (!/^#?[0-9a-fA-F]{6}$/.test(v)) {
        this.paintColorPicker(root, cp, false);
        return;
      }
      const hsv = rgbToHsv(hexToRgb(v));
      cp._h = hsv[0];
      cp._s = hsv[1];
      cp._v = hsv[2];
      this.paintColorPicker(root, cp);
    });
    hex.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") hex.blur();
    });

    cp.querySelector(".mist-cp-done").addEventListener("click", () => this.closeColorPicker(root));

    const eye = cp.querySelector(".mist-cp-eye");
    if (!window.EyeDropper) {
      /* 只有 Chromium 支持；不支持就藏起来，别摆一个按了没反应的按钮 */
      eye.style.display = "none";
    } else {
      eye.addEventListener("click", async () => {
        try {
          const res = await new window.EyeDropper().open();
          const hsv = rgbToHsv(hexToRgb(res.sRGBHex));
          cp._h = hsv[0];
          cp._s = hsv[1];
          cp._v = hsv[2];
          this.paintColorPicker(root, cp);
        } catch (err) {
          /* 用户按 Esc 取消，不算错误 */
        }
      });
    }
    return cp;
  }

  openColorPicker(root, key, sw) {
    const cp = this.ensureColorPicker(root);
    if (cp._key === key && cp.classList.contains("on")) {
      this.closeColorPicker(root);
      return;
    }
    /* 插在「颜色」这一行的正下方：换区域时同一个元素跟着搬家 */
    const row = sw.closest(".mist-row");
    if (row && row.parentElement) row.parentElement.insertBefore(cp, row.nextSibling);
    cp._key = key;
    const hsv = rgbToHsv(hexToRgb(this.state[this.editMode][key]));
    cp._h = hsv[0];
    cp._s = hsv[1];
    cp._v = hsv[2];
    cp.classList.add("on");
    root.querySelectorAll(".mist-sw").forEach((s2) => s2.classList.toggle("on", s2 === sw));
    /* 只画，不改 state —— 打开面板不该算一次修改 */
    this.paintColorPicker(root, cp, false);
    /* 窄栏里取色器可能落在可视区外，滚一下让它露出来 */
    if (cp.scrollIntoView) cp.scrollIntoView({ block: "nearest" });
  }

  closeColorPicker(root) {
    const cp = root && root._mistCp;
    if (!cp) return;
    cp.classList.remove("on");
    cp._key = "";
    root.querySelectorAll(".mist-sw.on").forEach((s2) => s2.classList.remove("on"));
  }

  /* commit=false 时只刷新控件与预览，不写 state（打开/同步时用） */
  paintColorPicker(root, cp, commit) {
    if (!cp) return;
    const hex = hsvToHex(cp._h, cp._s, cp._v);
    const sv = cp.querySelector(".mist-cp-sv");
    sv.style.background =
      "linear-gradient(to top,#000,rgba(0,0,0,0))," +
      "linear-gradient(to right,#fff,hsl(" + Math.round(cp._h) + ",100%,50%))";
    cp.querySelector(".mist-cp-dot").style.left = cp._s * 100 + "%";
    cp.querySelector(".mist-cp-dot").style.top = (1 - cp._v) * 100 + "%";
    cp.querySelector(".mist-cp-hdot").style.left = (cp._h / 360) * 100 + "%";
    cp.querySelector(".mist-cp-prev").style.background = hex;
    const inp = cp.querySelector(".mist-cp-hex");
    if (inp !== document.activeElement) inp.value = hex.toUpperCase();
    if (commit === false || !cp._key) return;
    this.state[this.editMode][cp._key] = hex;
    this.apply();
    this.syncLabels(root);
    this.saveState();
  }

  syncControls(root) {
    const c = this.state[this.editMode] || this.state.light;
    const set = (sel, val) => {
      const el = root.querySelector(sel);
      if (el) el.value = val;
    };
    /* 颜色没有 input 了（走自绘取色器），这里只同步四个透明度滑块 */
    ["sideAlpha", "editorAlpha", "dockAlpha", "topAlpha"].forEach((k) => {
      set('[data-k="' + k + '"]', c[k]);
    });
    set('[data-k="contrast"]', this.state.contrast);
    set('[data-k="bgFit"]', this.state.bg.fit);
    set('[data-k="bgPos"]', this.state.bg.pos);
    set('[data-k="bgScope"]', this.state.bg.scope);
    set('[data-k="editorFont"]', this.state.font.editorFont);
    set('[data-k="editorSize"]', this.state.font.editorSize);
    set('[data-k="editorWeight"]', this.state.font.editorWeight);
    set('[data-k="treeFont"]', this.state.font.treeFont);
    set('[data-k="treeSize"]', this.state.font.treeSize);
    set('[data-k="treeWeight"]', this.state.font.treeWeight);
    set('[data-k="headingWeight"]', this.state.font.headingWeight);
    set('[data-k="titleSize"]', this.state.font.titleSize);
    set('[data-k="titleWeight"]', this.state.font.titleWeight);
    const fl = this.state.float || {};
    Object.keys(FLOAT_KMAP).forEach((k) => set('[data-k="' + k + '"]', fl[FLOAT_KMAP[k]]));
    ["enable", "pinBtn", "grain"].forEach((k) => {
      const cb = root.querySelector('[data-fk="' + k + '"]');
      if (cb) cb.checked = !!fl[k];
    });
    const tb = root.querySelector('[data-bool="tableFit"]');
    if (tb) tb.checked = !!this.state.tableFit;
    const fh = root.querySelector("#mistFloatHint");
    if (fh) {
      const a = FLOAT_ANIMS.find((x) => x.key === (fl.anim || "none"));
      fh.textContent = a ? a.hint : "";
    }
    this.syncLabels(root);
    this.renderIconArea(root);
    /* 取色器开着（切了明暗、套了预设）就按新值重画，别停在旧色上 */
    const cp = root._mistCp;
    if (cp && cp.classList.contains("on") && cp._key) {
      const hsv = rgbToHsv(hexToRgb(c[cp._key]));
      cp._h = hsv[0];
      cp._s = hsv[1];
      cp._v = hsv[2];
      this.paintColorPicker(root, cp, false);
    }
  }

  syncLabels(root) {
    const c = this.state[this.editMode] || this.state.light;
    const put = (k, text) => {
      const el = root.querySelector('[data-v="' + k + '"]');
      if (el) el.textContent = text;
    };
    for (const k of ["sideAlpha", "editorAlpha", "dockAlpha", "topAlpha"]) put(k, c[k] + "%");
    for (const k of ["sideColor", "editorColor", "dockColor", "topColor"]) {
      put(k, c[k]);
      const sw = root.querySelector('[data-sw="' + k + '"]');
      if (sw) sw.style.backgroundColor = c[k];
    }
    put("contrast", this.state.contrast + "%");
    put("editorSize", this.state.font.editorSize + "px");
    put("treeSize", this.state.font.treeSize + "px");
    put("titleSize", this.state.font.titleSize + "px");
    put("editorWeight", this.state.font.editorWeight);
    put("treeWeight", this.state.font.treeWeight);
    put("headingWeight", this.state.font.headingWeight);
    put("titleWeight", this.state.font.titleWeight);
    const fl = this.state.float || {};
    put("floatRadius", fl.radius + "px");
    put("floatBlur", fl.blur + "px");
    put("floatSat", fl.sat + "%");
    put("floatAlpha", fl.alpha + "%");
    put("floatShadow", (fl.shadow / 100).toFixed(2));
    put("floatGap", fl.gap + "px");
    put("floatDur", fl.dur + "ms");
  }

  renderThumb(root) {
    const el = root.querySelector("#mistThumb");
    if (!el) return;
    const img = this.state.bg.img;
    if (!img) {
      el.style.backgroundImage = "none";
      el.style.backgroundColor = "var(--b3-theme-surface)";
      return;
    }
    el.style.backgroundColor = "transparent";
    el.style.backgroundImage = 'url("' + img + '")';
    el.style.backgroundSize = bgSizeOf(this.state.bg.fit);
    el.style.backgroundRepeat = bgRepeatOf(this.state.bg.fit);
    el.style.backgroundPosition = bgPosOf(this.state.bg.pos);
  }

  renderStatus(root) {
    const el = root.querySelector("#mistStatus");
    if (!el) return;
    const ok = this.isMist();
    const themeName = document.documentElement.dataset.themeMode === "dark"
      ? document.documentElement.dataset.darkTheme
      : document.documentElement.dataset.lightTheme;
    const icons = this.listIcons().length;
    el.innerHTML =
      `<div>主题：<b>${esc(themeName || "未知")}</b> ${ok ? '<span class="mist-tag">生效中</span>' : '<span class="mist-tag warn">未生效</span>'}</div>` +
      `<div>模式：<b>${this.isDark() ? "暗色" : "浅色"}</b>，正在编辑 <b>${this.editMode === "dark" ? "暗色" : "浅色"}</b> 那一套</div>` +
      `<div>可用图标：<b>${icons}</b> 个（当前图标包）</div>`;
    const ab = root.querySelector("#mistAbout");
    if (ab) {
      ab.innerHTML =
        `<div>当前主题：<b>${esc(themeName || "未知")}</b> ${ok ? '<span class="mist-tag">薄雾，设置生效</span>' : '<span class="mist-tag warn">不是薄雾，设置已停用</span>'}</div>` +
        `<div>已替换文档树图标：<b>${this.countPainted()}</b> 个</div>` +
        `<div>可用图标：<b>${icons}</b> 个</div>` +
        `<div>设置文件：<code>data/storage/petal/mist-enhancer/${STORE_FILE}</code></div>`;
    }
  }

  renderIconArea(root) {
    ["nb", "doc"].forEach((key) => {
      const box = root.querySelector('[data-cur="' + key + '"]');
      if (!box) return;
      const id = this.state.icons[key];
      box.innerHTML = `<svg><use xlink:href="#${esc(id)}" href="#${esc(id)}"></use></svg><code>${esc(id)}</code>`;
    });
    const stat = root.querySelector("#mistIconStat");
    if (stat) {
      stat.textContent = this.needsIconPaint()
        ? "已替换 " + this.countPainted() + " 个默认图标。思源重建文档树后会自动补上。"
        : "当前是思源默认图标，没有替换任何条目。";
    }
  }

  countPainted() {
    let n = 0;
    document.querySelectorAll(".file-tree .b3-list-item__icon svg > use[data-mist-orig]").forEach((use) => {
      if (use.getAttribute("xlink:href") !== "#" + use.getAttribute("data-mist-orig")) n += 1;
    });
    return n;
  }

  renderIconGrid(root, key) {
    const box = root.querySelector('[data-grid="' + key + '"]');
    if (!box) return;
    const inp = root.querySelector('[data-icsearch="' + key + '"]');
    const q = (inp && inp.value ? inp.value : "").trim().toLowerCase();
    const all = this.listIcons();
    const list = q ? all.filter((id) => id.toLowerCase().includes(q)) : all;
    const cur = this.state.icons[key];
    const slice = list.slice(0, 400);
    box.innerHTML = slice.length
      ? slice
          .map(
            (id) =>
              `<span class="cell${id === cur ? " on" : ""}" data-ic="${esc(id)}" title="${esc(id)}">` +
              `<svg><use xlink:href="#${esc(id)}" href="#${esc(id)}"></use></svg></span>`
          )
          .join("")
      : '<div class="mist-empty" style="grid-column:1/-1">没有匹配的图标</div>';
    const cnt = root.querySelector('[data-iccount="' + key + '"]');
    if (cnt) cnt.textContent = list.length + " 个";

    box.querySelectorAll(".cell").forEach((cell) => {
      cell.addEventListener("click", () => {
        const id = cell.getAttribute("data-ic");
        this.state.icons[key] = id;
        box.querySelectorAll(".cell").forEach((c) => c.classList.toggle("on", c === cell));
        this.paintIcons();
        this.renderIconArea(root);
        this.saveState();
      });
    });
  }

  /* ---------------- 本机字体列表（0.2.11）---------------- */

  /* 探测本机已安装字体，结果缓存在 this._fonts（一次会话只探一次）。
     路子一 queryLocalFonts：Chromium 本地字体访问 API，清单最全；权限被拒
     （Electron 默认不放行）会 reject，自动降级到路子二。
     路子二 canvas 度量：拿 FONT_CANDIDATES 逐个量同一串字的宽度，和后备
     字体量得不一样就说明装了。无需权限，Win/mac 通用。
     两条路都空（理论上不会）就返回空数组，面板会提示手打。 */
  detectFonts() {
    if (this._fonts) return Promise.resolve(this._fonts);
    const byCanvas = () => {
      const cv = document.createElement("canvas").getContext("2d");
      const test = "mmmmmmmmmmlli 薄雾主题 WWWWIIII 0123";
      const bases = ["monospace", "sans-serif", "serif"];
      const base = {};
      bases.forEach((b) => {
        cv.font = "72px " + b;
        base[b] = cv.measureText(test).width;
      });
      const hit = (name) =>
        bases.some((b) => {
          cv.font = "72px '" + name + "', " + b;
          return cv.measureText(test).width !== base[b];
        });
      return FONT_CANDIDATES.filter(hit).sort((a, b) => a.localeCompare(b));
    };
    const keep = (list) => {
      this._fonts = list;
      return list;
    };
    if (typeof window.queryLocalFonts === "function") {
      return window
        .queryLocalFonts()
        .then((fs) => {
          const names = [...new Set((fs || []).map((f) => f && f.family).filter(Boolean))];
          return keep(names.length ? names.sort((a, b) => a.localeCompare(b)) : byCanvas());
        })
        .catch(() => keep(byCanvas()));
    }
    return Promise.resolve(keep(byCanvas()));
  }

  renderFontList(root) {
    const box = root.querySelector("[data-flist]");
    const cnt = root.querySelector("[data-fcount]");
    if (!box) return;
    /* 探测是异步的：第一次打开先画「检测中」，探完自己重画一次。
       root.contains(box) 判断面板还在（用户可能中途切走 tab）。 */
    if (!this._fonts) {
      box.innerHTML = '<div class="mist-empty">正在检测本机已安装字体…</div>';
      if (cnt) cnt.textContent = "";
      this.detectFonts().then(() => {
        if (root.contains(box)) this.renderFontList(root);
      });
      return;
    }
    const inp = root.querySelector("[data-fsearch]");
    const q = (inp && inp.value ? inp.value : "").trim().toLowerCase();
    const target = root.querySelector('[data-k="' + this._fontTarget + '"]');
    const cur = (target && target.value ? target.value : "").split(",")[0].trim();
    let list = q ? this._fonts.filter((f) => f.toLowerCase().includes(q)) : this._fonts.slice();
    /* 当前设的字体万一没探到（探测漏网/手打的别名），也摆在第一位，
      不然用户看不到自己现在用的是什么、想改回去找不到。 */
    if (cur && !list.some((f) => f === cur)) list.unshift(cur);
    if (cnt) cnt.textContent = list.length + " 款";
    box.innerHTML = list.length
      ? list
          .map(
            (f) =>
              `<div class="fi${f === cur ? " on" : ""}" data-font="${esc(f)}" title="${esc(f)}">` +
              `<span class="nm" style="font-family:'${esc(f)}',sans-serif">${esc(f)}</span>` +
              `<span class="pv" style="font-family:'${esc(f)}',sans-serif">永</span></div>`
          )
          .join("")
      : '<div class="mist-empty">没有匹配的字体。列表只列本机已安装的；也可以直接在上面输入框里手打字体名。</div>';
    box.querySelectorAll(".fi").forEach((el) => {
      el.addEventListener("click", () => {
        const f = el.getAttribute("data-font");
        /* 输入框现查不闭包捕获：万一哪天换目标忘了重画，也不会写错框 */
        const inp = root.querySelector('[data-k="' + this._fontTarget + '"]');
        if (!inp) return;
        inp.value = f;
        /* 派发 change 走和手打输入同一条路：写 state.font → apply → 存盘 */
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        this.renderFontList(root);
      });
    });
  }
}

module.exports = MistEnhancer;
