// services/secrets.js 的模板文件。
// 使用方法：复制本文件为 services/secrets.js（同目录），填入真实密钥。
// services/secrets.js 已加入 .gitignore，不会被提交；微信上传包需要它，请勿加入 packOptions.ignore。
module.exports = {
  modelGateway: {
    baseUrl: 'https://modelgateway.zju.edu.cn/v1/chat/completions',
    apiKey: '在此填入模型网关 API Key',
    model: 'deepseek-v4-flash-780k-local',
    verificationCode: '在此填入模型试验验证码（如不需要可留空字符串）'
  },
  ocr: {
    url: 'https://mcp.zju.edu.cn/api/protal/proxy/system/layout-parsing',
    apiKey: '在此填入 OCR API Key'
  }
};
