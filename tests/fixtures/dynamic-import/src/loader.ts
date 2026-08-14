export async function loadJob(name: string): Promise<unknown> {
  return import(`./jobs/${name}.js`);
}
