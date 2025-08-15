import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfig } from './ConfigContext';
import { SetupModal } from './SetupModal';
import { startOpenRouterSetup } from '../utils/openRouterSetup';
import WelcomeGooseLogo from './WelcomeGooseLogo';
import { initializeSystem } from '../utils/providerUtils';
import { toastService } from '../toasts';
import { OllamaSetup } from './OllamaSetup';
import { checkOllamaStatus } from '../utils/ollamaDetection';

interface ProviderGuardProps {
  children: React.ReactNode;
}

export default function ProviderGuard({ children }: ProviderGuardProps) {
  const { read, getExtensions, addExtension } = useConfig();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [hasProvider, setHasProvider] = useState(false);
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);
  const [showOllamaSetup, setShowOllamaSetup] = useState(false);
  const [ollamaDetected, setOllamaDetected] = useState(false);
  const [openRouterSetupState, setOpenRouterSetupState] = useState<{
    show: boolean;
    title: string;
    message: string;
    showProgress: boolean;
    showRetry: boolean;
    autoClose?: number;
  } | null>(null);

  const handleOpenRouterSetup = async () => {
    setOpenRouterSetupState({
      show: true,
      title: 'Setting up OpenRouter',
      message: 'A browser window will open for authentication...',
      showProgress: true,
      showRetry: false,
    });

    const result = await startOpenRouterSetup();
    if (result.success) {
      setOpenRouterSetupState({
        show: true,
        title: 'Setup Complete!',
        message: 'OpenRouter has been configured successfully. Initializing Goose...',
        showProgress: true,
        showRetry: false,
      });

      // After successful OpenRouter setup, force reload config and initialize system
      try {
        // Get the latest config from disk
        const config = window.electron.getConfig();
        const provider = (await read('GOOSE_PROVIDER', false)) ?? config.GOOSE_DEFAULT_PROVIDER;
        const model = (await read('GOOSE_MODEL', false)) ?? config.GOOSE_DEFAULT_MODEL;

        if (provider && model) {
          // Initialize the system with the new provider/model
          await initializeSystem(provider as string, model as string, {
            getExtensions,
            addExtension,
          });

          toastService.configure({ silent: false });
          toastService.success({
            title: 'Success!',
            msg: `Started goose with ${model} by OpenRouter. You can change the model via the lower right corner.`,
          });

          // Close the modal and mark as having provider
          setOpenRouterSetupState(null);
          setShowFirstTimeSetup(false);
          setHasProvider(true);
        } else {
          throw new Error('Provider or model not found after OpenRouter setup');
        }
      } catch (error) {
        console.error('Failed to initialize after OpenRouter setup:', error);
        toastService.configure({ silent: false });
        toastService.error({
          title: 'Initialization Failed',
          msg: `Failed to initialize with OpenRouter: ${error instanceof Error ? error.message : String(error)}`,
          traceback: error instanceof Error ? error.stack || '' : '',
        });
      }
    } else {
      setOpenRouterSetupState({
        show: true,
        title: 'Openrouter setup pending',
        message: result.message,
        showProgress: false,
        showRetry: true,
      });
    }
  };

  useEffect(() => {
    const checkProvider = async () => {
      try {
        const config = window.electron.getConfig();
        console.log('ProviderGuard - Full config:', config);

        const provider = (await read('GOOSE_PROVIDER', false)) ?? config.GOOSE_DEFAULT_PROVIDER;
        const model = (await read('GOOSE_MODEL', false)) ?? config.GOOSE_DEFAULT_MODEL;

        // Always check for Ollama regardless of provider status
        const ollamaStatus = await checkOllamaStatus();
        setOllamaDetected(ollamaStatus.isRunning);

        if (provider && model) {
          console.log('ProviderGuard - Provider and model found, continuing normally');
          setHasProvider(true);
        } else {
          console.log('ProviderGuard - No provider/model configured');
          setShowFirstTimeSetup(true);
        }
      } catch (error) {
        // On error, assume no provider and redirect to welcome
        console.error('Error checking provider configuration:', error);
        navigate('/welcome', { replace: true });
      } finally {
        setIsChecking(false);
      }
    };

    checkProvider();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read]);

  // Poll for Ollama status while the first time setup is shown
  useEffect(() => {
    if (!showFirstTimeSetup) return;

    const checkOllama = async () => {
      const status = await checkOllamaStatus();
      setOllamaDetected(status.isRunning);
    };

    // Check every 3 seconds
    const interval = window.setInterval(checkOllama, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [showFirstTimeSetup]);

  if (isChecking && !openRouterSetupState?.show && !showFirstTimeSetup && !showOllamaSetup) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-textStandard"></div>
      </div>
    );
  }

  if (openRouterSetupState?.show) {
    return (
      <SetupModal
        title={openRouterSetupState.title}
        message={openRouterSetupState.message}
        showProgress={openRouterSetupState.showProgress}
        showRetry={openRouterSetupState.showRetry}
        onRetry={handleOpenRouterSetup}
        autoClose={openRouterSetupState.autoClose}
        onClose={() => setOpenRouterSetupState(null)}
      />
    );
  }

  if (showOllamaSetup) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background-default">
        <div className="max-w-md w-full mx-auto p-8">
          <div className="mb-8 text-center">
            <WelcomeGooseLogo />
          </div>
          <OllamaSetup
            onSuccess={() => {
              setShowOllamaSetup(false);
              setHasProvider(true);
            }}
            onCancel={() => {
              setShowOllamaSetup(false);
              setShowFirstTimeSetup(true);
            }}
          />
        </div>
      </div>
    );
  }

  if (showFirstTimeSetup) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background-default">
        <div className="max-w-md w-full mx-auto p-8 text-center">
          <WelcomeGooseLogo />
          <h1 className="text-2xl font-bold text-text-standard mt-8 mb-4">Welcome to Goose!</h1>
          <p className="text-text-muted mb-8">
            Let's get you set up with an AI provider to start using Goose.
          </p>

          <div className="space-y-4">
            <button
              onClick={handleOpenRouterSetup}
              className="w-full px-6 py-3 bg-background-muted text-text-standard rounded-lg hover:bg-background-hover transition-colors font-medium flex items-center justify-center gap-2"
            >
              Automatic setup with OpenRouter (recommended)
            </button>

            <button
              onClick={() => {
                setShowFirstTimeSetup(false);
                setShowOllamaSetup(true);
              }}
              className="w-full px-6 py-3 bg-background-muted text-text-standard rounded-lg hover:bg-background-hover transition-colors font-medium flex items-center justify-center gap-2"
            >
              {ollamaDetected ? (
                <>
                  <span className="text-text-success">●</span>
                  Use Ollama (auto detected)
                </>
              ) : (
                'Set up Ollama (run AI locally and free)'
              )}
            </button>

            <button
              onClick={() => navigate('/welcome', { replace: true })}
              className="w-full px-6 py-3 bg-background-muted text-text-standard rounded-lg hover:bg-background-hover transition-colors font-medium"
            >
              Configure Other Providers (advanced)
            </button>
          </div>

          <p className="text-sm text-text-muted mt-6">
            OpenRouter provides instant access to multiple AI models with a simple setup.
            {ollamaDetected
              ? ' Ollama is also detected on your system for running models locally.'
              : ' You can also install Ollama to run free AI models locally on your computer.'}
          </p>
        </div>
      </div>
    );
  }

  if (!hasProvider) {
    // This shouldn't happen, but just in case
    return null;
  }

  return <>{children}</>;
}
