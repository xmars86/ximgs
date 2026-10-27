# xImgs 品牌资源

| 文件 | 用途 |
|------|------|
| `app.ico` | Windows 窗口图标、安装包 / 快捷方式图标 |
| `logo.png` | 应用内品牌（侧栏、设置、favicon）、README |
| `logo.svg` | 设计源文件（体积大，含嵌入位图；**勿**直接打进渲染产物） |
| `pay/pay_wechat.jpg` | 乐捐：微信支付收款码（设置 → 关于 / README） |
| `pay/pay_alipay.jpg` | 乐捐：支付宝收款码（设置 → 关于 / README） |
| `installer.nsh` | NSIS 自定义：默认安装到用户可写目录（`D:\Apps\xImgs` 或 `%USERPROFILE%\Apps\xImgs`） |

> 收款码为个人收款信息，公开仓库即长期公开；若不希望入库，可改为仅打进安装包并在 README 中引导至应用内扫码。

构建配置：`electron-builder.yml` 的 `directories.buildResources` 指向本目录；运行时通过 `extraResources` 带上 `app.ico` 与 `logo.png`（`installer.nsh` 仅打包用，不进 extraResources）。
