// node-fetch → 全局 fetch。customFetch 把它当作第二条链路重试，
// 测试里两条链路等价即可。
const nodeFetch = (url, init) => globalThis.fetch(url, init);
export default nodeFetch;
export const Response = globalThis.Response;
