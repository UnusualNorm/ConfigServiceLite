const CONFIGS_DIR = "./configs";

const configFiles: string[] = [];

const readDirForConfigs = async (dir: string) => {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) {
      await readDirForConfigs(`${dir}/${entry.name}`);
    } else {
      configFiles.push(`${dir}/${entry.name}`);
    }
  }
};
await readDirForConfigs(CONFIGS_DIR);

export interface Config {
  priority: number;
  platforms: string[];
  extends?: [string, string, string];
  type: string;
  id: string;
}

const configs: Config[] = [];
for (const file of configFiles) {
  const data = await Deno.readTextFile(file);
  const config: Config = JSON.parse(data);
  configs.push(config);
  console.log(config);
}

export const getConfig = (
  platform: string,
  type: string,
  id: string,
): Config | undefined => {
  const config =
    configs.filter((config) =>
      config.platforms.includes(platform) && config.type === type &&
      config.id === id
    ).sort((a, b) => b.priority - a.priority)[0];

  if (!config && platform !== "generic") return getConfig("generic", type, id);
  else if (!config) return;

  if (config.extends) {
    const [platform, type, id] = config.extends;
    const extendedConfig = getConfig(platform, type, id);
    if (extendedConfig) {
      return { ...extendedConfig, ...config };
    }
  }

  return config;
};
