import LegalDocumentLayout, { LegalSection } from "../components/legal/LegalDocumentLayout";

export default function CookiePolicy() {
  return (
    <LegalDocumentLayout
      title="Cookie 政策"
      subtitle="登录状态与浏览器存储"
      effectiveDate="2026 年 9 月 7 日"
      currentPath="/cookie-policy"
      summary={<p>EliangMat AI 使用必要的登录 Cookie 和少量界面偏好存储。研究记录及账号记忆保存在平台账号空间，不保存在登录 Cookie 中。</p>}
    >
      <LegalSection title="1. 登录 Cookie">
        <p>eliangmat_session 用于保持账号登录，最长有效期为 7 天。退出登录会使当前会话失效并清除该 Cookie；其他已登录设备的会话不会因此自动退出。</p>
        <p>该 Cookie 仅随平台接口请求发送，使用 HttpOnly 和 SameSite=Strict；正式 HTTPS 服务启用 Secure。浏览器脚本不能读取该登录凭证。当前正式平台不在 localStorage 中保存登录 Token。</p>
      </LegalSection>
      <LegalSection title="2. 本地偏好存储">
        <p>浏览器 localStorage 保存按账号区分的最近使用项目标识，用于回到上次打开的项目。它不包含研究正文、验证码或模型 API 密钥，并且会保留到被更新或你清除浏览器站点数据。</p>
        <p>清除浏览器存储可能重置项目选择或登录状态，但不会删除服务器上的账号记忆和项目资料。</p>
      </LegalSection>
      <LegalSection title="3. 第三方与广告">
        <p>当前平台不使用广告追踪 Cookie。短信及外部模型由服务器按所需范围调用，不依赖第三方广告 Cookie。打开外部文献或供应商网站后，该网站的 Cookie 由其自身政策管理。</p>
      </LegalSection>
      <LegalSection title="4. 你的控制方式">
        <p>你可以通过退出登录结束当前会话，也可在浏览器设置中清除站点 Cookie 和存储。禁用必要 Cookie 会使需要登录的功能无法保持会话。</p>
        <p>如果希望停止自动记忆或处理服务器资料，请进入账号记忆设置或联系客服；清除 Cookie 不能代替撤回数据授权或删除服务器资料。</p>
      </LegalSection>
      <LegalSection title="5. 更新与联系">
        <p>当登录或存储方式改变时，我们会更新本说明。有关 Cookie 的问题可通过页脚客服入口联系 EliangMat AI。</p>
      </LegalSection>
    </LegalDocumentLayout>
  );
}
