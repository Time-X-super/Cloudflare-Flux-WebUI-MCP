import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from './Button';
import TextArea from './TextArea';
import Input from './Input';
import { createApiService } from '../utils/api';

/**
 * FLUX.2 模型配置
 * 每个条目对应一个可选模型及其步数范围
 */
const MODELS = [
  {
    id: '@cf/black-forest-labs/flux-2-klein-4b',
    labelKey: 'imageGenerator.models.klein4b',
    stepsMin: 1,
    stepsMax: 8,
    stepsDefault: 4,
  },
  {
    id: '@cf/black-forest-labs/flux-2-klein-9b',
    labelKey: 'imageGenerator.models.klein9b',
    stepsMin: 1,
    stepsMax: 8,
    stepsDefault: 4,
  },
  {
    id: '@cf/black-forest-labs/flux-2-dev',
    labelKey: 'imageGenerator.models.dev',
    stepsMin: 1,
    stepsMax: 50,
    stepsDefault: 25,
  },
];

const DEFAULT_MODEL_ID = '@cf/black-forest-labs/flux-2-klein-4b';
const SIZE_PRESETS = [512, 768, 1024, 1280, 1536];
const DEFAULT_SIZE = 1024;

/**
 * 图像生成器组件
 * @param {Object} props - 组件属性
 * @param {string} props.apiUrl - API URL
 * @param {string} props.apiToken - API Bearer Token
 * @returns {JSX.Element} 图像生成器组件
 */
const ImageGenerator = ({ apiUrl, apiToken }) => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [width, setWidth] = useState(DEFAULT_SIZE);
  const [height, setHeight] = useState(DEFAULT_SIZE);
  const [steps, setSteps] = useState(4);
  const [generatedImage, setGeneratedImage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedImages, setGeneratedImages] = useState([]);

  // 创建API服务
  const apiService = createApiService(apiUrl, apiToken);

  // 当前选中模型的配置
  const activeModel = useMemo(
    () => MODELS.find((m) => m.id === model) || MODELS[0],
    [model]
  );

  // 切换模型时把 steps 限制到新模型的 [min, max] 范围内；
  // 如果之前在新范围之外，则重置为该模型的默认值。
  useEffect(() => {
    setSteps((current) => {
      if (current < activeModel.stepsMin || current > activeModel.stepsMax) {
        return activeModel.stepsDefault;
      }
      return current;
    });
  }, [activeModel]);
  
  /**
   * 生成图像
   */
  const generateImage = async () => {
    if (!prompt.trim()) {
      setError(t('imageGenerator.emptyPromptError'));
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const result = await apiService.generateImage(prompt, {
        model,
        steps: Number(steps),
        width: Number(width),
        height: Number(height),
      });
      
      if (result && result.image) {
        setGeneratedImage(result.image);
        
        // 添加到历史记录（包含模型与分辨率信息）
        // 历史项保存 labelKey 而非已翻译的字符串，这样切换语言时旧条目也会跟随更新；
        // modelLabel 仍然保留作为回退（兼容旧持久化数据 / 缺少 labelKey 的条目）。
        setGeneratedImages(prev => [
          {
            id: Date.now(),
            prompt,
            image: result.image,
            date: new Date().toLocaleString(),
            model,
            labelKey: activeModel.labelKey,
            modelLabel: t(activeModel.labelKey),
            width: Number(width),
            height: Number(height),
          },
          ...prev
        ].slice(0, 10)); // 只保留最近10张图片
      } else {
        throw new Error(t('imageGenerator.invalidImageError'));
      }
    } catch (err) {
      console.error(t('imageGenerator.generateError', { message: '' }) + ':', err);
      setError(t('imageGenerator.generateError', { message: err.message || t('common.error') }));
    } finally {
      setIsLoading(false);
    }
  };
  
  /**
   * 下载图像
   */
  const downloadImage = () => {
    if (!generatedImage) return;
    
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `flux-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  /**
   * 渲染历史记录项
   * @param {Object} item - 历史记录项
   * @returns {JSX.Element} 历史记录项组件
   */
  const renderHistoryItem = (item) => {
    // labelKey 在新版本被记录；旧条目可能只有已翻译的 modelLabel，回退使用它。
    const displayedModelLabel = item.labelKey ? t(item.labelKey) : item.modelLabel;
    return (
    <div key={item.id} className="p-4 bg-gray-800 bg-opacity-50 rounded-lg">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-32 h-32 overflow-hidden rounded-lg flex-shrink-0">
          <img
            src={item.image}
            alt={item.prompt}
            className="w-full h-full object-cover"
            onClick={() => {
              setGeneratedImage(item.image);
              setPrompt(item.prompt);
            }}
          />
        </div>
        <div className="flex-grow">
          <p className="text-sm text-gray-400 mb-1">{item.date}</p>
          {(displayedModelLabel || item.width) && (
            <p className="text-xs text-gray-500 mb-1">
              {displayedModelLabel}
              {displayedModelLabel && item.width ? ' · ' : ''}
              {item.width && item.height ? `${item.width}x${item.height}` : ''}
            </p>
          )}
          <p className="text-gray-200 line-clamp-2 mb-2">{item.prompt}</p>
          <div className="flex space-x-2">
            <Button
              type="outline"
              className="text-xs py-1 px-2"
              onClick={() => {
                setGeneratedImage(item.image);
                setPrompt(item.prompt);
              }}
            >
              {t('common.reuse')}
            </Button>
            <Button
              type="secondary"
              className="text-xs py-1 px-2"
              onClick={() => {
                const link = document.createElement('a');
                link.href = item.image;
                link.download = `flux-image-${item.id}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
            >
              {t('common.download')}
            </Button>
          </div>
        </div>
      </div>
    </div>
    );
  };
  
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* 左侧：表单 */}
        <div className="space-y-6">
          <div className="tech-border rounded-xl p-6">
            <h2 className="text-2xl font-bold mb-4">{t('imageGenerator.title')}</h2>
            <TextArea
              label={t('imageGenerator.promptLabel')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('imageGenerator.promptPlaceholder')}
              rows={6}
              required
            />

            {/* 模型选择 */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-200 mb-2">
                {t('imageGenerator.modelLabel')}
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 bg-opacity-50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-white transition-colors"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {t(m.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            {/* 分辨率：宽 × 高 */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  {t('imageGenerator.widthLabel')}
                </label>
                <select
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-gray-800 bg-opacity-50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-white transition-colors"
                >
                  {SIZE_PRESETS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">
                  {t('imageGenerator.heightLabel')}
                </label>
                <select
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-gray-800 bg-opacity-50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-white transition-colors"
                >
                  {SIZE_PRESETS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <Input
                label={t('imageGenerator.stepsLabel', {
                  min: activeModel.stepsMin,
                  max: activeModel.stepsMax,
                })}
                type="number"
                value={steps}
                onChange={(e) =>
                  setSteps(
                    Math.min(
                      activeModel.stepsMax,
                      Math.max(activeModel.stepsMin, parseInt(e.target.value) || activeModel.stepsMin)
                    )
                  )
                }
                min={activeModel.stepsMin}
                max={activeModel.stepsMax}
              />
              <p className="text-xs text-gray-400 mt-1">
                {t('imageGenerator.stepsHint')}
              </p>
            </div>
            
            {error && (
              <div className="mt-4 p-3 bg-red-900 bg-opacity-30 border border-red-500 rounded-lg text-red-200">
                {error}
              </div>
            )}
            
            <div className="mt-6">
              <Button
                onClick={generateImage}
                loading={isLoading}
                className="w-full"
              >
                {isLoading ? t('imageGenerator.generatingButton') : t('imageGenerator.generateButton')}
              </Button>
            </div>
          </div>
          
          {/* 历史记录 */}
          <div className="tech-border rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">{t('history.title')}</h2>
            
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {generatedImages.length > 0 ? (
                generatedImages.map(renderHistoryItem)
              ) : (
                <p className="text-gray-400 text-center py-8">{t('history.emptyHistory')}</p>
              )}
            </div>
          </div>
        </div>
        
        {/* 右侧：结果 */}
        <div className="tech-border rounded-xl p-6">
          <h2 className="text-2xl font-bold mb-4">{t('imageGenerator.resultTitle')}</h2>
          
          <div className="aspect-square bg-gray-900 bg-opacity-50 rounded-lg flex items-center justify-center overflow-hidden">
            {generatedImage ? (
              <img 
                src={generatedImage} 
                alt="Generated" 
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-center p-8">
                <div className="w-24 h-24 mx-auto mb-4 border-4 border-gray-700 border-opacity-50 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-gray-400">
                  {t('imageGenerator.noImagePlaceholder')}
                </p>
              </div>
            )}
          </div>
          
          {generatedImage && (
            <div className="mt-4 flex justify-center">
              <Button
                type="secondary"
                onClick={downloadImage}
                className="mr-4"
              >
                {t('common.download')}
              </Button>
              <Button
                type="outline"
                onClick={() => {
                  setGeneratedImage('');
                  setPrompt('');
                }}
              >
                {t('common.clear')}
              </Button>
            </div>
          )}
          
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-3">{t('imageGenerator.tips.title')}</h3>
            <ul className="list-disc list-inside text-gray-300 space-y-2 text-sm">
              <li>{t('imageGenerator.tips.tip1')}</li>
              <li>{t('imageGenerator.tips.tip2')}</li>
              <li>{t('imageGenerator.tips.tip3')}</li>
              <li>{t('imageGenerator.tips.tip4')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageGenerator; 
