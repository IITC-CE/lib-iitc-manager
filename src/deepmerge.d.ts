declare module '@bundled-es-modules/deepmerge' {
  function deepmerge<T>(x: Partial<T>, y: Partial<T>, options?: object): T;
  export default deepmerge;
}
