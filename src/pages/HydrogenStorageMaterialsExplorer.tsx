import SimpleMaterialsExplorer from '../components/explorers/SimpleMaterialsExplorer';
import { SIMPLE_EXPLORER_CONFIGS } from '../data/simpleExplorerConfigs';

const HydrogenStorageMaterialsExplorer = () => (
  <SimpleMaterialsExplorer config={SIMPLE_EXPLORER_CONFIGS['hydrogen-storage']} />
);

export default HydrogenStorageMaterialsExplorer;
