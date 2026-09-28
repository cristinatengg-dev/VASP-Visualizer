export const ICP_RECORD_URL = 'https://beian.miit.gov.cn/';

const records = Object.freeze({
  'eliangai.com': '浙ICP备2026000780号-3',
  'scivisualizer.com': '浙ICP备2026000780号-2',
});

export function getIcpRecordNumber(hostname = globalThis.location?.hostname || '') {
  const domain = hostname.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  return Object.hasOwn(records, domain) ? records[domain] : records['eliangai.com'];
}
