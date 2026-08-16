export const PYTHON_PACKAGE_IMPORT_MAP: Readonly<Record<string, readonly string[]>> = {
  'apache-airflow': ['airflow'],
  attrs: ['attr', 'attrs'],
  beautifulsoup4: ['bs4'],
  dnspython: ['dns'],
  'google-cloud-storage': ['google.cloud.storage'],
  grpcio: ['grpc'],
  'opencv-python': ['cv2'],
  pillow: ['PIL'],
  protobuf: ['google.protobuf'],
  'psycopg2-binary': ['psycopg2'],
  pyjwt: ['jwt'],
  'python-dateutil': ['dateutil'],
  'python-dotenv': ['dotenv'],
  'python-jose': ['jose'],
  'python-multipart': ['multipart'],
  pyyaml: ['yaml'],
  'scikit-learn': ['sklearn'],
  'sentry-sdk': ['sentry_sdk'],
};

export function expectedPythonImports(distribution: string): readonly string[] {
  return PYTHON_PACKAGE_IMPORT_MAP[distribution] ?? [distribution.replaceAll('-', '_')];
}
