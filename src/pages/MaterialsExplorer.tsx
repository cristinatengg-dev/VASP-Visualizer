import SimpleMaterialsExplorer from '../components/explorers/SimpleMaterialsExplorer';
import { SIMPLE_EXPLORER_CONFIGS } from '../data/simpleExplorerConfigs';

const MaterialsExplorer = () => (
  <SimpleMaterialsExplorer config={SIMPLE_EXPLORER_CONFIGS.battery} />
);

export default MaterialsExplorer;
