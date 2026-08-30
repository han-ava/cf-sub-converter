import { describe, expect, test } from 'bun:test';
import { renderHtmlPage } from '../src/ui';

type ElementStub = {
  value: string;
  innerHTML: string;
  textContent: string;
  style: Record<string, string>;
  classList: {
    add: (...names: string[]) => void;
    remove: (...names: string[]) => void;
  };
};

function createElementStub(): ElementStub {
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    style: {},
    classList: {
      add() {},
      remove() {},
    },
  };
}

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function createUiHarness() {
  const html = renderHtmlPage('test-version');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch?.[1]) throw new Error('inline UI script not found');

  const elements: Record<string, ElementStub> = {};
  const requiredIds = [
    'authToken',
    'warningInspectorBox',
    'warningAggList',
    'warningAggBadge',
    'nodeTableBody',
    'tablePagination',
    'pageSummary',
    'pageControls',
  ];
  requiredIds.forEach(id => {
    elements[id] = createElementStub();
  });

  const document = {
    getElementById(id: string) {
      return elements[id] ?? null;
    },
  };
  const localStorage = createStorage({ subconv_saved_token: 'legacy-secret' });
  const sessionStorage = createStorage();
  const script = scriptMatch[1]
    .replace(/\n\s*renderFavorites\(\);\s*$/, '');

  const buildHarness = new Function(
    'document',
    'window',
    'navigator',
    'localStorage',
    'sessionStorage',
    'alert',
    'fetch',
    'setTimeout',
    'clearTimeout',
    `${script}
      return {
        renderPreview(data, openFirstNode) {
          currentPreviewData = data;
          if (openFirstNode) openedNodeSet.add(0);
          renderNodeTable();
        },
        saveAuthToken,
        restoreAuthToken
      };
    `,
  );

  const client = buildHarness(
    document,
    { location: { origin: 'https://example.test' } },
    {},
    localStorage,
    sessionStorage,
    () => {},
    async () => ({ json: async () => ({}) }),
    () => 0,
    () => {},
  ) as {
    renderPreview: (data: unknown, openFirstNode: boolean) => void;
    saveAuthToken: () => void;
    restoreAuthToken: () => void;
  };

  return { client, elements, html, localStorage, sessionStorage };
}

describe('UI security', () => {
  test('preview escapes untrusted node and warning fields before assigning innerHTML', () => {
    const { client, elements } = createUiHarness();
    const server = '<img src=x onerror=serverAttack()>';
    const port = '443<img src=x onerror=portAttack()>';
    const type = '<svg onload=typeAttack()>';
    const protocol = '<img src=x onerror=protocolAttack()>';
    const param = 'transport" onmouseover="paramAttack()';

    client.renderPreview({
      warningCount: 1,
      warningAggregations: [{ protocol, param, count: 1 }],
      nodes: [{
        name: 'safe node',
        server,
        port,
        type,
        conversion: { status: 'warning', warnings: [], unsupportedParams: [] },
      }],
    }, true);

    const tableHtml = elements.nodeTableBody!.innerHTML;
    expect(tableHtml).not.toContain('<img src=x onerror=serverAttack()>');
    expect(tableHtml).not.toContain('<img src=x onerror=portAttack()>');
    expect(tableHtml).not.toContain('<SVG ONLOAD=TYPEATTACK()>');
    expect(tableHtml).toContain('&lt;img src=x onerror=serverAttack()&gt;:443&lt;img src=x onerror=portAttack()&gt;');
    expect(tableHtml).toContain('&lt;SVG ONLOAD=TYPEATTACK()&gt;');

    const warningHtml = elements.warningAggList!.innerHTML;
    expect(warningHtml).not.toContain('<img src=x onerror=protocolAttack()>');
    expect(warningHtml).toContain('&lt;img src=x onerror=protocolAttack()&gt;');
    expect(warningHtml).toContain('transport&quot; onmouseover=&quot;paramAttack()');
    expect(warningHtml).toContain('onclick="filterByWarningParamAt(0)"');
    expect(warningHtml).not.toContain(`onclick="filterByWarningParam('${param}')"`);
  });

  test('AUTH_TOKEN uses a password input and session-only storage', () => {
    const { client, elements, html, localStorage, sessionStorage } = createUiHarness();
    expect(html).toContain('<input type="password" id="authToken"');
    expect(localStorage.getItem('subconv_saved_token')).toBeNull();

    elements.authToken!.value = 'session-secret';
    client.saveAuthToken();
    expect(sessionStorage.getItem('subconv_saved_token')).toBe('session-secret');

    elements.authToken!.value = '';
    client.restoreAuthToken();
    expect(elements.authToken!.value).toBe('session-secret');

    elements.authToken!.value = '   ';
    client.saveAuthToken();
    expect(sessionStorage.getItem('subconv_saved_token')).toBeNull();
  });
});
