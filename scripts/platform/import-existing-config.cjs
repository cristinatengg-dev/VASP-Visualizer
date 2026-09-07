// Run inside the existing backend and redirect stdout to a protected server-local
// .config/platform.env. Never print the result or copy existing identity stores.
const keys = [
  'GEMINI_BASE_URL', 'GEMINI_API_KEY', 'GEMINI_TEXT_MODEL',
  'GEMINI_MAX_OUTPUT_TOKENS', 'OPENALEX_API_KEY', 'CROSSREF_EMAIL',
  'UNPAYWALL_EMAIL', 'TENCENTCLOUD_SECRET_ID', 'TENCENTCLOUD_SECRET_KEY',
  'TENCENT_SMS_SDK_APP_ID', 'TENCENT_SMS_SIGN_NAME', 'TENCENT_SMS_TEMPLATE_ID',
  'TENCENT_SMS_REGION',
];
const required = ['GEMINI_API_KEY', ...keys.filter(k => k.startsWith('TENCENT') && k !== 'TENCENT_SMS_REGION')];
if (required.some(k => !process.env[k])) {
  console.error('Existing integration configuration is incomplete');
  process.exit(1);
}
const values = Object.fromEntries(keys.filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(values, {
  ELIANGMAT_ORIGINS:'https://scivisualizer.com,https://www.scivisualizer.com',
  HOST:'0.0.0.0', PORT:'3000', ELIANGMAT_STORAGE_DIR:'/app/.data/platform',
  GEMINI_MAX_OUTPUT_TOKENS: values.GEMINI_MAX_OUTPUT_TOKENS || '8192',
});
for (const [key,value] of Object.entries(values)) process.stdout.write(key+'='+JSON.stringify(value)+'\n');
