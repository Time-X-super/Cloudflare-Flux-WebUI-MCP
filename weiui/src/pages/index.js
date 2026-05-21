import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import ImageGenerator from '../components/ImageGenerator';
import Input from '../components/Input';
import Button from '../components/Button';
import {
  getApiConfig,
  saveApiConfig,
  removeFromStorage,
  STORAGE_KEYS,
} from '../utils/storage';

/**
 * 主页组件
 * @returns {JSX.Element} 主页组件
 */
export default function Home() {
  const { t } = useTranslation();
  const [isClient, setIsClient] = useState(false);
  const [apiConfig, setApiConfig] = useState({
    apiUrl: '',
    apiToken: '',
    isDeployed: false,
  });
  const [inputApiUrl, setInputApiUrl] = useState('');
  const [inputApiToken, setInputApiToken] = useState('');
  const [showUrlForm, setShowUrlForm] = useState(true);

  // 初始化apiConfig
  useEffect(() => {
    setIsClient(true);
    // 获取保存的API URL和Token，或者从saved_worker_url.txt读取URL
    const config = getApiConfig();

    const storedUrl =
      typeof config.apiUrl === 'string' ? config.apiUrl.trim() : '';
    const storedToken =
      typeof config.apiToken === 'string' ? config.apiToken.trim() : '';

    if (storedUrl && storedToken) {
      // URL 与 Token 都齐全，可以直接进入生成界面
      console.log('找到已保存的Worker URL和Token');
      setApiConfig({
        ...config,
        apiUrl: storedUrl,
        apiToken: storedToken,
      });
      setShowUrlForm(false);
      return;
    }

    if (storedUrl && !storedToken) {
      // 只存了 URL，没有 Token：预填 URL，但仍要求用户填写 Token
      console.log('已保存Worker URL，但缺少API Token，等待用户输入Token');
      setInputApiUrl(storedUrl);
      setApiConfig({
        ...config,
        apiUrl: storedUrl,
        apiToken: '',
      });
      setShowUrlForm(true);
      return;
    }

    console.log('未找到有效的Worker URL，尝试从saved_worker_url.txt读取');
    // 使用fetch从当前目录的saved_worker_url.txt读取
    fetch('/saved_worker_url.txt')
      .then((response) => {
        if (response.ok) return response.text();
        throw new Error(t('apiConfig.emptyUrlError'));
      })
      .then((url) => {
        const trimmedUrl = url.trim();
        if (trimmedUrl) {
          // 仅预填 URL 输入框；不再自动隐藏表单或写入存储，
          // 因为 Token 仍未提供，必须由用户手动确认。
          console.log('从saved_worker_url.txt读取到URL:', trimmedUrl);
          setInputApiUrl(trimmedUrl);
          setShowUrlForm(true);
        } else {
          console.log('saved_worker_url.txt为空或内容无效');
          setShowUrlForm(true);
        }
      })
      .catch((err) => {
        console.error(t('apiConfig.emptyUrlError') + ':', err);
        setShowUrlForm(true);
      });
  }, [t]);

  /**
   * 处理保存API URL和Token
   */
  const handleSaveApiUrl = () => {
    const trimmedUrl = (inputApiUrl || '').trim();
    const trimmedToken = (inputApiToken || '').trim();

    if (trimmedUrl === '') {
      alert(t('apiConfig.emptyUrlError'));
      return;
    }
    if (trimmedToken === '') {
      alert(t('apiConfig.emptyTokenError'));
      return;
    }

    const newConfig = {
      ...apiConfig,
      apiUrl: trimmedUrl,
      apiToken: trimmedToken,
      isDeployed: true,
    };

    setApiConfig(newConfig);
    saveApiConfig(newConfig);

    // 显示保存成功的消息
    alert(t('apiConfig.saveSuccess'));

    // 成功保存后再切换到生成图像界面
    setShowUrlForm(false);
  };

  /**
   * 处理重置设置
   */
  const handleReset = () => {
    if (window.confirm(t('common.resetConfig') + '?')) {
      const newConfig = {
        apiUrl: '',
        apiToken: '',
        isDeployed: false,
      };
      // saveApiConfig 对 apiUrl/apiToken 用 truthy 短路（'' 不会被写入），
      // 但对 isDeployed 用 `!== undefined` 判断；因此这里只把 isDeployed=false
      // 通过 saveApiConfig 持久化，URL 与 Token 通过 removeFromStorage 显式清除。
      // 这样既避免了对同两个键先无操作写、再删的冗余，也保留了 saveApiConfig
      // 作为 API config 写入的唯一入口语义。
      saveApiConfig({ isDeployed: false });
      removeFromStorage(STORAGE_KEYS.API_URL);
      removeFromStorage(STORAGE_KEYS.API_TOKEN);
      setApiConfig(newConfig);
      setInputApiUrl('');
      setInputApiToken('');
      setShowUrlForm(true);
    }
  };

  /**
   * 处理输入URL的变化
   */
  const handleUrlInputChange = (e) => {
    setInputApiUrl(e.target.value);
  };

  /**
   * 处理输入Token的变化
   */
  const handleTokenInputChange = (e) => {
    setInputApiToken(e.target.value);
  };

  // 渲染URL输入表单
  const renderUrlForm = () => {
    return (
      <div className="max-w-2xl mx-auto p-6 tech-border rounded-xl">
        <h2 className="text-2xl font-bold mb-4">{t('apiConfig.title')}</h2>
        <p className="mb-6 text-gray-300">
          {t('apiConfig.description')}
        </p>
        <Input
          label={t('apiConfig.urlLabel')}
          placeholder={t('apiConfig.urlPlaceholder')}
          value={inputApiUrl}
          onChange={handleUrlInputChange}
          required
        />
        <Input
          label={t('apiConfig.tokenLabel')}
          type="password"
          placeholder={t('apiConfig.tokenPlaceholder')}
          value={inputApiToken}
          onChange={handleTokenInputChange}
          required
        />
        <div className="mt-4">
          <Button onClick={handleSaveApiUrl}>
            {t('apiConfig.saveButton')}
          </Button>
        </div>
        <div className="mt-4 text-sm text-gray-400">
          <p>{t('apiConfig.guideTitle')}</p>
          <ol className="list-decimal list-inside mt-2 space-y-1">
            <li dangerouslySetInnerHTML={{__html: t('apiConfig.guideSteps.step1')}} />
            <li dangerouslySetInnerHTML={{__html: t('apiConfig.guideSteps.step2')}} />
            <li dangerouslySetInnerHTML={{__html: t('apiConfig.guideSteps.step3')}} />
            <li dangerouslySetInnerHTML={{__html: t('apiConfig.guideSteps.step4')}} />
          </ol>
        </div>
      </div>
    );
  };

  // 渲染图像生成界面
  const renderImageGenerator = () => {
    return (
      <>
        <div className="flex justify-end p-4">
          <button
            onClick={handleReset}
            className="text-sm text-gray-400 hover:text-primary-400 transition-colors"
          >
            {t('common.resetConfig')}
          </button>
        </div>
        <ImageGenerator apiUrl={apiConfig.apiUrl} apiToken={apiConfig.apiToken} />
      </>
    );
  };

  // 页面内容
  const renderContent = () => {
    if (!isClient) {
      return <div className="flex justify-center items-center h-96">{t('common.loading')}</div>;
    }

    return showUrlForm ? renderUrlForm() : renderImageGenerator();
  };

  return (
    <div className="min-h-screen">
      <Head>
        <title>{t('common.appName')} - {t('header.subtitle')}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <Header />

      <main className="container mx-auto py-8 px-4">
        {renderContent()}
      </main>

      <footer className="py-8 mt-12 border-t border-gray-800">
        <div className="container mx-auto px-4 text-center text-gray-500 text-sm">
          <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
          <p className="mt-2">{t('footer.poweredBy')}</p>
        </div>
      </footer>
    </div>
  );
}
