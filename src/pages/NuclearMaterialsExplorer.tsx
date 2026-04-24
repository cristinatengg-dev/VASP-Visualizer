import SimpleMaterialsExplorer from '../components/explorers/SimpleMaterialsExplorer';
import { SIMPLE_EXPLORER_CONFIGS } from '../data/simpleExplorerConfigs';

const NuclearMaterialsExplorer = () => (
  <SimpleMaterialsExplorer config={SIMPLE_EXPLORER_CONFIGS.nuclear} />
);

export default NuclearMaterialsExplorer;
