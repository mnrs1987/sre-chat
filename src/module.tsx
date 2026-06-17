import { PanelPlugin } from '@grafana/data';
import { FloatingWindow } from './components/FloatingWindow';

interface Options {
  apiUrl: string;
  method?: string;
  tenantId?: string;
  apiKey?: string;
  customHeaders?: string;
}

export const plugin = new PanelPlugin<Options>(FloatingWindow).setPanelOptions(builder => {
  return builder
    .addTextInput({
      path: 'apiUrl',
      name: 'API URL',
      description: 'Full API endpoint (e.g., https://api.example.com/data)',
      defaultValue: 'https://jsonplaceholder.typicode.com/todos/1',
    })
    .addRadio({
      path: 'method',
      name: 'HTTP Method',
      description: 'Choose GET or POST',
      settings: {
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
        ],
      },
      defaultValue: 'GET',
    })
    .addTextInput({
      path: 'tenantId',
      name: 'Tenant ID (optional)',
      description: 'Optional tenant header (X-Scope-OrgID)',
    })
    .addTextInput({
     path: 'apiKey',
     name: 'API Key (optional)',
     description: 'Optional API key header (Authorization)',
   })
   .addTextInput({
    path: 'customHeaders',
    name: 'Custom Headers (JSON, optional)',
    description: 'Provide extra headers as JSON (e.g., {"Authorization":"Bearer token"})',
  });
});
