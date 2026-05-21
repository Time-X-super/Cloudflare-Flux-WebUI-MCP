import axios from 'axios';

/**
 * 创建API服务
 * @param {string} baseURL - API基础URL
 * @param {string} token - 认证令牌
 * @returns {Object} API服务对象
 */
export const createApiService = (baseURL, token) => {
  // 确保baseURL是完整的URL，包含协议前缀
  let apiBaseUrl = baseURL;
  
  // 如果baseURL没有以协议开头，添加https://
  if (apiBaseUrl && !apiBaseUrl.startsWith('http://') && !apiBaseUrl.startsWith('https://')) {
    apiBaseUrl = `https://${apiBaseUrl}`;
  }
  
  // 创建带有默认设置的axios实例
  const api = axios.create({
    baseURL: apiBaseUrl,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  return {
    /**
     * 生成图像
     * @param {string} prompt - 提示词
     * @param {Object} [options] - 生成参数选项
     * @param {string} [options.model] - FLUX.2 模型 ID（例如 @cf/black-forest-labs/flux-2-klein-4b）
     * @param {number} [options.steps] - 推理步数（每个模型的范围由 Worker 校验）
     * @param {number} [options.width] - 输出宽度（像素）
     * @param {number} [options.height] - 输出高度（像素）
     * @returns {Promise<Object>} 包含生成图像的响应
     */
    generateImage: async (prompt, options = {}) => {
      const { model, steps, width, height } = options;
      try {
        const body = { prompt };
        if (model !== undefined) body.model = model;
        if (steps !== undefined) body.steps = steps;
        if (width !== undefined) body.width = width;
        if (height !== undefined) body.height = height;
        const response = await api.post('', body);
        return response.data;
      } catch (error) {
        console.error('生成图像出错:', error);
        throw error;
      }
    },
    
    /**
     * 部署Cloudflare Worker
     * @param {Object} deployConfig - 部署配置
     * @returns {Promise<Object>} 部署结果
     */
    deployWorker: async (deployConfig) => {
      // 此方法只是模拟，实际部署需要在用户本地执行npm命令
      return {
        success: true,
        message: '部署命令已准备就绪，请在命令行执行',
        command: `cd cf-flux-schnell && npm install && npm run deploy`
      };
    }
  };
}; 
