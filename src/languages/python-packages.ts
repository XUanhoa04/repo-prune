export const PYTHON_PACKAGE_IMPORT_MAP: Readonly<Record<string, readonly string[]>> = {
  beautifulsoup4: ['bs4'],
  'google-cloud-storage': ['google.cloud.storage'],
  'opencv-python': ['cv2'],
  pillow: ['PIL'],
  'psycopg2-binary': ['psycopg2'],
  pyyaml: ['yaml'],
  'python-dateutil': ['dateutil'],
  'scikit-learn': ['sklearn'],
};

export function expectedPythonImports(distribution: string): readonly string[] {
  return PYTHON_PACKAGE_IMPORT_MAP[distribution] ?? [distribution.replaceAll('-', '_')];
}
