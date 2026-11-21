/**
 * 伪 vscode，供 node --test 加载依赖 vscode 的源码模块。
 * 测试通过 globalThis.__chunzenTestConfig 读写任意配置项。
 */
const CONFIG = (globalThis.__chunzenTestConfig ||= {});

function getConfiguration(section) {
  const bucket = CONFIG[section] || (CONFIG[section] = {});
  return {
    get: (key, dflt) => (key in bucket ? bucket[key] : dflt),
    has: (key) => key in bucket,
    inspect: () => undefined,
    update: async (key, value) => { bucket[key] = value; }
  };
}

const api = {
  workspace: { getConfiguration },
  window: {
    showInformationMessage() {},
    showErrorMessage() {},
    showWarningMessage() {},
    createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} })
  },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  Uri: { file: (p) => ({ fsPath: p, scheme: 'file', toString: () => 'file://' + p }) },
  commands: { executeCommand: async () => undefined }
};

export default api;
export const workspace = api.workspace;
export const window = api.window;
export const ConfigurationTarget = api.ConfigurationTarget;
export const Uri = api.Uri;
export const commands = api.commands;
