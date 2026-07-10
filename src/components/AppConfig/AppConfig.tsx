import React, { ChangeEvent, useState } from 'react';
import { lastValueFrom } from 'rxjs';
import { css } from '@emotion/css';
import { AppPluginMeta, GrafanaTheme2, PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Button, Field, FieldSet, Input, SecretInput, RadioButtonGroup, useStyles2 } from '@grafana/ui';

type AppPluginSettings = {
  apiUrl?: string;
  method?: string; // Added method to settings
};

type State = {
  apiUrl: string;
  method: string; // Added method to state
  isApiKeySet: boolean;
  apiKey: string;
};

export interface AppConfigProps extends PluginConfigPageProps<AppPluginMeta<AppPluginSettings>> {}

const AppConfig = ({ plugin }: AppConfigProps) => {
  const s = useStyles2(getStyles);
  const { enabled, pinned, jsonData, secureJsonFields } = plugin.meta;

  const [state, setState] = useState<State>({
    apiUrl: jsonData?.apiUrl || '',
    method: jsonData?.method || 'POST', // Default to POST
    apiKey: '',
    isApiKeySet: Boolean(secureJsonFields?.apiKey),
  });

  const isSubmitDisabled = !state.apiUrl || (!state.isApiKeySet && !state.apiKey);

  const onResetApiKey = () =>
    setState({ ...state, apiKey: '', isApiKeySet: false });

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setState({ ...state, [event.target.name]: event.target.value.trim() });
  };

  const onMethodChange = (value: string) => {
    setState({ ...state, method: value });
  };

  const onSubmit = async () => {
    if (isSubmitDisabled) return;

    try {
      await updatePlugin(plugin.meta.id, {
        enabled,
        pinned,
        jsonData: {
          apiUrl: state.apiUrl,
          method: state.method // Saving the method
        },
        secureJsonData: state.isApiKeySet ? undefined : { apiKey: state.apiKey },
      });
      window.location.reload();
    } catch (e) {
      console.error('Error updating settings:', e);
    }
  };

  const methodOptions = [
    { label: 'GET', value: 'GET' },
    { label: 'POST', value: 'POST' },
  ];

  return (
    <div style={{ maxWidth: '600px' }}>
      <FieldSet label="SRE Assistant API Settings">
        <Field label="API Url" description="The endpoint for the SRE backend">
          <Input
            width={60}
            name="apiUrl"
            value={state.apiUrl}
            placeholder="[api.sre.example.com](https://api.sre.example.com/v1)"
            onChange={onChange}
          />
        </Field>

        <Field label="HTTP Method" description="Request method to use when talking to the API">
          <RadioButtonGroup
            options={methodOptions}
            value={state.method}
            onChange={onMethodChange}
          />
        </Field>

        <Field label="API Key" description="Auth token for the backend (Stored securely)">
          <SecretInput
            width={60}
            name="apiKey"
            value={state.apiKey}
            isConfigured={state.isApiKeySet}
            placeholder="Your secret API key"
            onChange={onChange}
            onReset={onResetApiKey}
          />
        </Field>

        <div className={s.marginTop}>
          <Button type="button" onClick={onSubmit} disabled={isSubmitDisabled}>
            Save API settings
          </Button>
        </div>
      </FieldSet>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  marginTop: css`margin-top: ${theme.spacing(3)};`,
});

const updatePlugin = async (pluginId: string, data: Partial<PluginMeta>) => {
  const response = await getBackendSrv().fetch({
    url: `/api/plugins/${pluginId}/settings`,
    method: 'POST',
    data,
  });
  return lastValueFrom(response);
};

export default AppConfig;
