# Orbital Traffic 技术文档

## 1. 技术栈

- Vite 6.4，`base: './'`，构建产物位于 `dist/`。
- 原生 JavaScript ES Module、Three.js 0.180、WebGL、OrbitControls、dat.GUI 与 Stats.js。
- 视觉主体直接使用上游 Earth、Atmosphere、MergedFlightPaths、InstancedPlanes、8 种 SVG 飞机和真实航线数据，没有用另一套粒子球重画。
- 正式海报由 Aigram transit `gen-image` 生成叙事底图，再进行标题、安全区和缩略图制作。

## 2. 目录结构

- `src/main.js`：上游场景初始化、异步数据档位、自由相机、双指冻结状态机、幽灵引导、音频、错误态与 QA 状态。
- `src/Earth.js`：原版地球与产品 2,048px / 基线 8,192px 纹理；基线从上游 GitHub Pages 同源快照加载原始 18MB 纹理。
- `src/DataProduct.js`：产品档前 7,000 条原始航线；基线按固定上游提交 URL 读取完整 34,297 条原始数据。
- `src/MergedFlightPaths.js`、`InstancedPlanes.js`、`Flight.js`：路径批处理、飞机实例化与逐航班运动。
- `src/style.css`：无设备外框的航空图注 UI、Material `touch_app` 双指、响应式、Loading 与 Error。
- `upstream/ATTRIBUTION.md`：MIT 上游、固定提交与基线说明。
- `_qa/capture.mjs`：移动端、窄屏、桌面、真实双指、自由相机、完整基线和错误态自动验证。

## 3. 核心模块

- 启动：`bootstrap()` 根据视口动态导入产品 7,000 条数据；只有进入基线时才从固定提交抓取并解析完整 34,297 条数据，产品页不会下载基线数据。移动端显示 3,500 架，桌面 7,000 架。
- 原版对照：`?baseline=1` 使用完整数据、原始 8,192px 纹理、3,500 默认航班、dat.GUI、Stats、作者页脚和原版相机时间。
- 主循环：原版 `requestAnimationFrame(animate)` 更新 OrbitControls、星场、航班、路径、太阳、坐标和渲染；产品只把 `flightSpeedScale` 乘入同一航班时间。
- 输入：OrbitControls 独占单指旋转、双指 pinch 和滚轮；额外 Pointer Map 只在两指各自移动不超过 12px 且持续 650ms 时进入冻结。
- 闭环：冻结在 220ms 内降至 0、路径透明度升到 0.82、地球降到 55%；松手以 2.4 倍释放并在 1,800ms 回到原速，同时恢复光照与大气层。
- 引导：两枚 Google Material `touch_app` 手指调用同一 `freezeAirspace()` / `releaseAirspace()`，不是仅播放图标动画；首次真实输入取消演示。
- 音频：首次输入解锁 AudioContext；冻结使用 84→110Hz 三角波，松手使用 180/270/405Hz 三音。
- 多语言：根据 `game_locale` 或浏览器语言选择 zh/en，产品文字来自 `productCopy`。
- QA：`window.__ORBITAL_TRAFFIC__` 暴露相机坐标、数据档、纹理档、状态、速度、光照与画布尺寸；`?forceError=1` 提供确定性错误态。

## 4. 扩展点

- 改航班规模：修改 `productFlightCount` 和 `src/DataProduct.js` 的数据切片，同时复测移动端帧率。
- 改冻结阈值与节奏：修改 `beginHoldCandidate()` 的 650ms、12px 和 `updateProductInteraction()` 的 220 / 1,800ms。
- 换地球纹理：替换 `public/world.topo-*.jpg`，保持相同宽高比与相对路径。
- 改视觉主体：优先扩展上游 `Earth`、`Atmosphere`、飞机与路径模块，不另建近似场景。
- 调 UI：修改 `src/style.css`；不增加设备框、常驻仪表板或单指操作说明。
- 加平台接口：永久游戏 UUID 为 `027698f2-3ef4-43f4-9124-29bf5ce9c878`，后续平台 session 必须继续使用此值。
