import { PanelPlugin } from '@grafana/data';
import { FloatingWindow } from './components/FloatingWindow';

interface Options {
  apiKey: string;
  mimirUrl: string;
  tenantId: string;
}

export const plugin = new PanelPlugin<Options>(FloatingWindow).setPanelOptions(builder => {
  return builder
    .addTextInput({
      path: 'mimirUrl',
      name: 'Mimir API URL',
      defaultValue: 'http://localhost:9009/prometheus/api/v1/query',
      settings: { placeholder: 'Provide your Mimir API URL' },
    })
    .addTextInput({
      path: 'tenantId',
      name: 'Tenant ID',
      defaultValue: 'demo',
      settings: { placeholder: 'Provide your tenant/org ID' },
    })
    .addTextInput({
      path: 'apiKey',
      name: 'API Key',
      settings: { placeholder: 'Provide your API key (optional)' },
    });
});
