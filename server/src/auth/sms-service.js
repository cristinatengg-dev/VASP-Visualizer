const tencentcloud = require('tencentcloud-sdk-nodejs');

function getSmsConfig(env = process.env) {
  return {
    secretId: env.TENCENTCLOUD_SECRET_ID,
    secretKey: env.TENCENTCLOUD_SECRET_KEY,
    sdkAppId: env.TENCENT_SMS_SDK_APP_ID,
    signName: env.TENCENT_SMS_SIGN_NAME,
    templateId: env.TENCENT_SMS_TEMPLATE_ID,
    region: env.TENCENT_SMS_REGION || 'ap-guangzhou',
  };
}

function createSmsClient(config) {
  const SmsClient = tencentcloud.sms.v20210111.Client;
  return new SmsClient({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: config.region,
    profile: {
      signMethod: 'HmacSHA256',
      httpProfile: {
        reqMethod: 'POST',
        reqTimeout: 10,
        endpoint: 'sms.tencentcloudapi.com',
      },
    },
  });
}

async function sendLoginCode(phone, code, options = {}) {
  const config = options.config || getSmsConfig();
  const client = options.client || createSmsClient(config);
  const response = await client.SendSms({
    SmsSdkAppId: config.sdkAppId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: [code, '5'],
    PhoneNumberSet: [phone],
  });

  const status = response?.SendStatusSet?.[0];
  if (!status || status.Code !== 'Ok') {
    const error = new Error(status?.Message || 'SMS provider rejected the message');
    error.providerCode = status?.Code || 'Unknown';
    error.requestId = response?.RequestId || '';
    throw error;
  }

  return { requestId: response.RequestId || '', serialNo: status.SerialNo || '' };
}

module.exports = { createSmsClient, getSmsConfig, sendLoginCode };
