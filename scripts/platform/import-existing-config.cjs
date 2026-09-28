// Run inside the existing backend and redirect stdout to a protected server-local
// .config/platform.env. Never print the result or copy existing identity stores.
const keys = [
  'HUNYUAN_BASE_URL', 'HUNYUAN_API_KEY', 'HUNYUAN_TEXT_MODEL',
  'HUNYUAN_MAX_OUTPUT_TOKENS', 'OPENALEX_API_KEY', 'CROSSREF_EMAIL',
  'UNPAYWALL_EMAIL', 'TENCENTCLOUD_SECRET_ID', 'TENCENTCLOUD_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID', 'TENCENT_SMS_SIGN_NAME', 'TENCENT_SMS_TEMPLATE_ID',
  'TENCENT_SMS_REGION',
];
// Missing model credentials leaves the platform in local-retrieval mode. Never
// copy a Gemini key into the new provider or prevent SMS-only startup.
const required = keys.filter(k => k.startsWith('TENCENT') && k !== 'TENCENT_SMS_REGION');
if (required.some(k => !process.env[k])) {
  console.error('Existing integration configuration is incomplete');
  process.exit(1);
}
const values = Object.fromEntries(keys.filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(values, {
  ELIANGMAT_ORIGINS: process.env.ELIANGMAT_ORIGINS || 'https://eliangai.com,https://www.eliangai.com,https://scivisualizer.com,https://www.scivisualizer.com',
  HOST:'0.0.0.0', PORT:'3000', ELIANGMAT_STORAGE_DIR:'/app/.data/platform',
  HUNYUAN_BASE_URL: values.HUNYUAN_BASE_URL || 'https://tokenhub.tencentmaas.com/v1',
  HUNYUAN_TEXT_MODEL: values.HUNYUAN_TEXT_MODEL || 'hy3',
  HUNYUAN_MAX_OUTPUT_TOKENS: values.HUNYUAN_MAX_OUTPUT_TOKENS || '8192',
});
for (const [key,value] of Object.entries(values)) process.stdout.write(key+'='+JSON.stringify(value)+'\n');
