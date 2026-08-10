export type AerospaceMaterialFamily =
  | '轻质结构'
  | '高温合金'
  | '推进与换热'
  | '热防护'
  | '陶瓷与涂层'
  | '润滑与聚合物'
  | '光机与热控'
  | '电子封装';

export type AerospaceMission =
  | '运载火箭'
  | '卫星平台'
  | '液体发动机'
  | '再入飞行器'
  | '深空探测'
  | '低轨星座';

export type AerospaceEvidence = '在役/遗产' | '工程成熟' | '试验验证' | '研发候选';

export interface CommercialAerospaceMaterial {
  id: string;
  name: string;
  designation: string;
  composition: string;
  searchFormula?: string;
  family: AerospaceMaterialFamily;
  missions: AerospaceMission[];
  applications: string[];
  maxServiceTempC: number;
  density: string;
  evidence: AerospaceEvidence;
  trl: number;
  advantages: string[];
  watchouts: string[];
  qualification: string[];
  sourceLabel: string;
  sourceUrl: string;
}

export interface AerospaceOfficialSource {
  id: string;
  name: string;
  organization: string;
  access: '公开' | '注册/申请' | '标准/许可';
  coverage: string;
  url: string;
}

const NASA_MAPTIS = 'https://maptis.nasa.gov/Features';
const NASA_OUTGASSING = 'https://outgassing.nasa.gov/';
const NASA_TPS = 'https://www.nasa.gov/thermal-protection-materials-branch/';
const NASA_UHTC = 'https://ntrs.nasa.gov/citations/20150022996';
const NASA_NTRS = 'https://ntrs.nasa.gov/';

export const AEROSPACE_MISSIONS: AerospaceMission[] = [
  '运载火箭',
  '卫星平台',
  '液体发动机',
  '再入飞行器',
  '深空探测',
  '低轨星座',
];

export const AEROSPACE_FAMILIES: AerospaceMaterialFamily[] = [
  '轻质结构',
  '高温合金',
  '推进与换热',
  '热防护',
  '陶瓷与涂层',
  '润滑与聚合物',
  '光机与热控',
  '电子封装',
];

export const COMMERCIAL_AEROSPACE_MATERIALS: CommercialAerospaceMaterial[] = [
  {
    id: 'al-2219-t851', name: '2219 铝合金', designation: 'Al 2219-T851', composition: 'Al-Cu 系', searchFormula: 'Al', family: '轻质结构',
    missions: ['运载火箭', '液体发动机'], applications: ['低温贮箱', '焊接壳体', '推进剂舱'], maxServiceTempC: 175, density: '2.84 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['成熟焊接体系', '低温韧性', '可热处理'], watchouts: ['焊缝与热影响区需单独取值', '耐蚀与应力腐蚀评估'], qualification: ['低温拉伸', '断裂韧性', '焊接工艺鉴定'], sourceLabel: 'NASA MAPTIS / MMPDS 路径', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'al-li-2195', name: '2195 铝锂合金', designation: 'Al-Li 2195', composition: 'Al-Cu-Li-Mg-Ag-Zr', searchFormula: 'Al', family: '轻质结构',
    missions: ['运载火箭'], applications: ['低温贮箱', '大直径筒段'], maxServiceTempC: 150, density: '2.71 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['较高比强度', '较低密度', '低温结构遗产'], watchouts: ['各向异性', '焊接窗口与缺陷敏感性'], qualification: ['低温疲劳', '焊接接头', '断裂控制'], sourceLabel: 'NASA Materials / MAPTIS', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'al-7075-t73', name: '7075 铝合金', designation: 'Al 7075-T73', composition: 'Al-Zn-Mg-Cu', searchFormula: 'Al', family: '轻质结构',
    missions: ['运载火箭', '卫星平台', '低轨星座'], applications: ['承力框', '支架', '星箭连接件'], maxServiceTempC: 120, density: '2.81 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['高比强度', '供应链成熟', '易机加工'], watchouts: ['应力腐蚀', '不可作为高温主承力材料'], qualification: ['SCC', '疲劳', '表面处理兼容性'], sourceLabel: 'NASA MAPTIS / MMPDS 路径', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'ti-6al-4v', name: 'Ti-6Al-4V 钛合金', designation: 'Ti-6Al-4V / Grade 5', composition: 'Ti-6Al-4V', searchFormula: 'Ti', family: '轻质结构',
    missions: ['运载火箭', '卫星平台', '液体发动机', '深空探测'], applications: ['压力容器接口', '紧固件', '发动机支架', '增材构件'], maxServiceTempC: 350, density: '4.43 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['高比强度', '耐蚀', '增材制造成熟度高'], watchouts: ['氧脆与氢脆', '摩擦咬合', '高温强度衰减'], qualification: ['氢相容性', 'AM 缺陷/NDE', '疲劳'], sourceLabel: 'NASA MAPTIS / NTRS', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'ti-6242', name: '近 α 高温钛合金', designation: 'Ti-6Al-2Sn-4Zr-2Mo', composition: 'Ti-6Al-2Sn-4Zr-2Mo', searchFormula: 'Ti', family: '高温合金',
    missions: ['运载火箭', '液体发动机'], applications: ['压气机部件', '中温承力件'], maxServiceTempC: 500, density: '4.54 g/cm³', evidence: '工程成熟', trl: 8,
    advantages: ['中温蠕变性能', '比镍基更轻'], watchouts: ['长期高温氧化', '锻造组织敏感'], qualification: ['蠕变', '持久强度', '显微组织'], sourceLabel: 'NASA aerospace materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'inconel-718', name: 'Inconel 718', designation: 'UNS N07718', composition: 'Ni-Cr-Fe-Nb-Mo', searchFormula: 'Ni', family: '高温合金',
    missions: ['运载火箭', '液体发动机'], applications: ['涡轮泵', '法兰', '燃烧室结构', '紧固件'], maxServiceTempC: 700, density: '8.19 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['高温强度', '焊接性较好', '成熟设计数据'], watchouts: ['密度高', 'Laves/δ 相与热处理窗口', '氢环境需验证'], qualification: ['低周疲劳', '蠕变', '热处理批次'], sourceLabel: 'NASA MAPTIS / MMPDS 路径', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'inconel-625', name: 'Inconel 625', designation: 'UNS N06625', composition: 'Ni-Cr-Mo-Nb', searchFormula: 'Ni', family: '高温合金',
    missions: ['液体发动机', '卫星平台'], applications: ['波纹管', '推进管路', '喷管与焊接件'], maxServiceTempC: 650, density: '8.44 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['耐蚀', '焊接友好', '固溶强化'], watchouts: ['高温长期组织稳定性', '较高质量成本'], qualification: ['推进剂相容性', '焊缝疲劳', '泄漏'], sourceLabel: 'NASA materials database path', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'haynes-230', name: 'HAYNES 230', designation: 'UNS N06230', composition: 'Ni-Cr-W-Mo', searchFormula: 'Ni', family: '高温合金',
    missions: ['液体发动机', '再入飞行器'], applications: ['高温内衬', '喷管附件', '热结构'], maxServiceTempC: 1150, density: '8.97 g/cm³', evidence: '工程成熟', trl: 8,
    advantages: ['高温抗氧化', '蠕变强度', '热循环能力'], watchouts: ['密度与成本', '加工硬化'], qualification: ['热循环', '高温氧化', '蠕变'], sourceLabel: 'NASA MAPTIS / NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'nasa-hr1', name: 'NASA HR-1', designation: 'Fe-Ni-Cr HR-1', composition: 'Fe-Ni-Cr 基抗氢合金', searchFormula: 'Fe', family: '推进与换热',
    missions: ['液体发动机'], applications: ['液氢燃烧室', '再生冷却通道', '增材推进部件'], maxServiceTempC: 700, density: '约 8.1 g/cm³', evidence: '试验验证', trl: 6,
    advantages: ['面向高压氢环境', '可增材制造', '高强韧平衡'], watchouts: ['公开设计许用值有限', 'AM 工艺与热处理强耦合'], qualification: ['高压氢脆', 'AM 工艺鉴定', '冷热循环'], sourceLabel: 'NASA NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'grcop-42', name: 'GRCop-42 铜合金', designation: 'Cu-4Cr-2Nb', composition: 'Cu-4Cr-2Nb', searchFormula: 'Cu', family: '推进与换热',
    missions: ['液体发动机'], applications: ['燃烧室内衬', '喷注器', '高热流换热壁'], maxServiceTempC: 700, density: '约 8.8 g/cm³', evidence: '工程成熟', trl: 7,
    advantages: ['高导热', '高温强度优于纯铜', '适配激光粉床增材'], watchouts: ['氧与粉末质量控制', '热处理与各向异性'], qualification: ['热流循环', 'AM 孔隙/NDE', '钎焊/包套界面'], sourceLabel: 'NASA additive manufacturing / NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'c103', name: 'C-103 铌合金', designation: 'Nb-10Hf-1Ti', composition: 'Nb-10Hf-1Ti', searchFormula: 'Nb', family: '推进与换热',
    missions: ['液体发动机', '深空探测'], applications: ['姿轨控喷管', '辐射冷却喷管', '高温薄壁件'], maxServiceTempC: 1370, density: '8.89 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['真空高温强度', '薄壁成形'], watchouts: ['空气中快速氧化', '需可靠抗氧化涂层'], qualification: ['涂层完整性', '真空热循环', '点火寿命'], sourceLabel: 'NASA propulsion materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'cfrp-cyanate', name: '氰酸酯基 CFRP', designation: 'High-modulus CFRP / cyanate ester', composition: '碳纤维/氰酸酯树脂', family: '轻质结构',
    missions: ['卫星平台', '深空探测', '低轨星座'], applications: ['主承力筒', '桁架', '天线背架', '光机支撑'], maxServiceTempC: 180, density: '1.5–1.7 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['极高比刚度', '低热膨胀可设计', '低吸湿配方可选'], watchouts: ['层间损伤', '原子氧/辐照', '树脂放气与微裂纹'], qualification: ['ASTM E595 放气', '热真空循环', '冲击后强度'], sourceLabel: 'NASA MAPTIS / Outgassing', sourceUrl: NASA_OUTGASSING,
  },
  {
    id: 'sic-sic-cmc', name: 'SiC/SiC 陶瓷基复材', designation: 'SiC fiber / SiC matrix CMC', composition: 'SiC/SiC', searchFormula: 'SiC', family: '陶瓷与涂层',
    missions: ['液体发动机', '再入飞行器'], applications: ['热结构', '喷管延伸段', '高温承力面板'], maxServiceTempC: 1400, density: '约 2.6 g/cm³', evidence: '试验验证', trl: 6,
    advantages: ['低密度耐高温', '损伤容限高于单体陶瓷'], watchouts: ['环境障涂层', '连接与密封', '高温水汽退化'], qualification: ['高温氧化', '热震', '连接件'], sourceLabel: 'NASA NTRS high-temperature materials', sourceUrl: NASA_NTRS,
  },
  {
    id: 'pica', name: 'PICA 烧蚀材料', designation: 'Phenolic Impregnated Carbon Ablator', composition: '酚醛浸渍碳毡', family: '热防护',
    missions: ['再入飞行器', '深空探测'], applications: ['返回舱热盾', '行星进入热防护'], maxServiceTempC: 2500, density: '低密度烧蚀体', evidence: '在役/遗产', trl: 9,
    advantages: ['高热流烧蚀防护', '飞行遗产充分'], watchouts: ['一次性烧蚀', '材料响应依赖热流/压力/气氛'], qualification: ['弧风洞', '烧蚀响应', '粘接与缝隙'], sourceLabel: 'NASA Thermal Protection Materials', sourceUrl: NASA_TPS,
  },
  {
    id: 'tufroc', name: 'TUFROC 可重复热防护', designation: 'Toughened Uni-piece Fibrous Reinforced Oxidation-Resistant Composite', composition: '纤维隔热体/耐氧化表层', family: '热防护',
    missions: ['再入飞行器'], applications: ['翼前缘', '机鼻', '可重复使用热防护'], maxServiceTempC: 1700, density: '低密度复合 TPS', evidence: '在役/遗产', trl: 9,
    advantages: ['可重复使用', '承受高表面温度', '兼顾隔热'], watchouts: ['冲击损伤', '局部修复与接缝设计'], qualification: ['弧风洞', '重复热循环', '冲击/雨蚀'], sourceLabel: 'NASA TPS testing and fabrication', sourceUrl: NASA_TPS,
  },
  {
    id: 'li900', name: 'LI-900 隔热瓦', designation: 'LI-900 silica tile', composition: '高纯多孔 SiO₂', searchFormula: 'SiO2', family: '热防护',
    missions: ['再入飞行器'], applications: ['大面积可重复隔热', '低承载热防护面'], maxServiceTempC: 1260, density: '约 0.14 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['极低导热与密度', '成熟飞行遗产'], watchouts: ['脆弱', '防水涂层与冲击损伤', '不承担主载荷'], qualification: ['热循环', '涂层完整性', '声振/冲击'], sourceLabel: 'NASA Thermal Protection Systems', sourceUrl: NASA_TPS,
  },
  {
    id: 'rcc', name: '增强碳-碳', designation: 'Reinforced Carbon-Carbon', composition: 'C/C + SiC 防氧化层', searchFormula: 'C', family: '热防护',
    missions: ['再入飞行器'], applications: ['翼前缘', '机鼻帽', '极端热流热结构'], maxServiceTempC: 1650, density: '约 1.6 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['高温承载', '低热膨胀'], watchouts: ['防氧化涂层缺陷敏感', '冲击与检查成本高'], qualification: ['涂层氧化', '无损检测', '冲击后热循环'], sourceLabel: 'NASA TPS references', sourceUrl: NASA_TPS,
  },
  {
    id: 'zrb2-sic', name: 'ZrB₂-SiC 超高温陶瓷', designation: 'ZrB2-SiC UHTC', composition: 'ZrB₂-SiC', searchFormula: 'ZrB2', family: '陶瓷与涂层',
    missions: ['再入飞行器', '深空探测'], applications: ['尖锐前缘', '高焓热流构件', '热防护涂层'], maxServiceTempC: 2000, density: '约 5.5–6.0 g/cm³', evidence: '研发候选', trl: 4,
    advantages: ['超高熔点', '高温导热与抗烧蚀潜力'], watchouts: ['断裂韧性', '氧化层稳定性', '大尺寸制造'], qualification: ['弧风洞', '氧化动力学', '热震/断裂'], sourceLabel: 'NASA UHTC overview', sourceUrl: NASA_UHTC,
  },
  {
    id: 'hfb2-sic', name: 'HfB₂-SiC 超高温陶瓷', designation: 'HfB2-SiC UHTC', composition: 'HfB₂-SiC', searchFormula: 'HfB2', family: '陶瓷与涂层',
    missions: ['再入飞行器', '深空探测'], applications: ['尖锐前缘', '超高温喷口', '抗烧蚀构件'], maxServiceTempC: 2200, density: '约 9–10 g/cm³', evidence: '研发候选', trl: 3,
    advantages: ['极高温潜力', '优良高温稳定性'], watchouts: ['密度与成本高', '脆性', '加工与连接困难'], qualification: ['高焓氧化', '热震', '连接界面'], sourceLabel: 'NASA UHTC overview', sourceUrl: NASA_UHTC,
  },
  {
    id: 'ysz-tbc', name: 'YSZ 热障涂层', designation: '7–8 wt% YSZ', composition: 'Y₂O₃ 稳定 ZrO₂', searchFormula: 'ZrO2', family: '陶瓷与涂层',
    missions: ['液体发动机', '再入飞行器'], applications: ['热障涂层', '金属热结构隔热层'], maxServiceTempC: 1200, density: '约 5.8–6.1 g/cm³', evidence: '工程成熟', trl: 8,
    advantages: ['低导热', '成熟喷涂工艺'], watchouts: ['热生长氧化层', '剥落', '高温相稳定性'], qualification: ['热循环寿命', '结合强度', '氧化层'], sourceLabel: 'NASA materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'mos2', name: '二硫化钼固体润滑剂', designation: 'MoS2 coating', composition: 'MoS₂', searchFormula: 'MoS2', family: '润滑与聚合物',
    missions: ['卫星平台', '深空探测', '低轨星座'], applications: ['轴承/齿轮涂层', '展开机构', '真空摩擦副'], maxServiceTempC: 400, density: '5.06 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['真空低摩擦', '成熟空间机构应用'], watchouts: ['湿空气储存退化', '原子氧与膜厚/基底敏感'], qualification: ['真空摩擦寿命', '储存环境', '颗粒脱落'], sourceLabel: 'NASA MAPTIS / MISSE', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'ws2', name: '二硫化钨固体润滑剂', designation: 'WS2 coating', composition: 'WS₂', searchFormula: 'WS2', family: '润滑与聚合物',
    missions: ['卫星平台', '深空探测'], applications: ['高载荷真空涂层', '释放与锁定机构'], maxServiceTempC: 450, density: '7.5 g/cm³', evidence: '工程成熟', trl: 8,
    advantages: ['真空摩擦性能', '温度窗口较宽'], watchouts: ['涂层致密度与附着', '地面湿度敏感'], qualification: ['真空寿命', '附着力', '热循环'], sourceLabel: 'NASA materials references', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'hbn', name: '六方氮化硼', designation: 'h-BN', composition: 'BN', searchFormula: 'BN', family: '润滑与聚合物',
    missions: ['卫星平台', '液体发动机', '深空探测'], applications: ['固体润滑', '电绝缘导热填料', '高温隔离'], maxServiceTempC: 900, density: '2.1 g/cm³', evidence: '工程成熟', trl: 7,
    advantages: ['绝缘且导热', '化学稳定', '层状润滑'], watchouts: ['不同晶型/纯度差异大', '潮湿环境与界面控制'], qualification: ['纯度', '介电强度', '热真空'], sourceLabel: 'NASA / structure databases', sourceUrl: NASA_NTRS,
  },
  {
    id: 'peek', name: 'PEEK 工程塑料', designation: 'PEEK', composition: '聚醚醚酮', family: '润滑与聚合物',
    missions: ['卫星平台', '低轨星座'], applications: ['绝缘件', '轻载支架', '线缆与轴承保持架'], maxServiceTempC: 250, density: '1.30 g/cm³', evidence: '工程成熟', trl: 8,
    advantages: ['耐温耐化学', '可加工/注塑', '增强级可选'], watchouts: ['放气取决于牌号与处理', '辐照与蠕变'], qualification: ['ASTM E595 放气', '辐照', '长期蠕变'], sourceLabel: 'NASA Outgassing Database', sourceUrl: NASA_OUTGASSING,
  },
  {
    id: 'polyimide', name: '聚酰亚胺', designation: 'Kapton / Vespel family', composition: '芳香族聚酰亚胺', family: '润滑与聚合物',
    missions: ['卫星平台', '深空探测', '低轨星座'], applications: ['柔性电路', '热控薄膜', '绝缘垫片', '干摩擦零件'], maxServiceTempC: 300, density: '1.42 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['宽温域', '电绝缘', '薄膜与块材形态丰富'], watchouts: ['原子氧侵蚀', '具体牌号放气与吸湿'], qualification: ['放气', '原子氧', '热循环/弯折'], sourceLabel: 'NASA Outgassing / MISSE', sourceUrl: NASA_OUTGASSING,
  },
  {
    id: 'aln', name: '氮化铝', designation: 'AlN ceramic', composition: 'AlN', searchFormula: 'AlN', family: '电子封装',
    missions: ['卫星平台', '液体发动机', '低轨星座'], applications: ['功率电子基板', '高导热电绝缘封装', '传感器基座'], maxServiceTempC: 800, density: '3.26 g/cm³', evidence: '工程成熟', trl: 8,
    advantages: ['高导热电绝缘', '热膨胀匹配半导体'], watchouts: ['水解敏感', '脆性与金属化界面'], qualification: ['介电', '热循环', '封装气密性'], sourceLabel: 'NASA electronics materials / NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'si3n4', name: '氮化硅陶瓷', designation: 'Si3N4', composition: 'Si₃N₄', searchFormula: 'Si3N4', family: '陶瓷与涂层',
    missions: ['液体发动机', '卫星平台'], applications: ['高温轴承', '绝缘结构件', '耐磨件'], maxServiceTempC: 1000, density: '3.2 g/cm³', evidence: '工程成熟', trl: 8,
    advantages: ['高断裂韧性陶瓷', '耐磨', '低热膨胀'], watchouts: ['烧结助剂影响', '脆性失效与检验'], qualification: ['滚动接触疲劳', '热震', 'NDE'], sourceLabel: 'NASA materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'fused-silica', name: '熔融石英', designation: 'Fused silica', composition: 'SiO₂', searchFormula: 'SiO2', family: '光机与热控',
    missions: ['卫星平台', '深空探测', '低轨星座'], applications: ['窗口', '光学基底', '激光/星敏感器光路'], maxServiceTempC: 900, density: '2.20 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['极低热膨胀', '宽光谱透过', '高热稳定'], watchouts: ['辐照致色心', '表面/亚表面损伤'], qualification: ['辐照透过率', '热冲击', '镀膜附着'], sourceLabel: 'NASA optical materials references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'zerodur', name: '微晶玻璃光学基底', designation: 'ZERODUR class glass-ceramic', composition: '锂铝硅微晶玻璃', family: '光机与热控',
    missions: ['卫星平台', '深空探测'], applications: ['高稳定反射镜', '光学平台', '精密基准'], maxServiceTempC: 600, density: '约 2.53 g/cm³', evidence: '在役/遗产', trl: 9,
    advantages: ['近零热膨胀等级可选', '长期尺寸稳定'], watchouts: ['脆性', '大尺寸轻量化加工与支撑设计'], qualification: ['热稳定', '声振', '镜坯缺陷'], sourceLabel: 'NASA optical systems references', sourceUrl: NASA_NTRS,
  },
  {
    id: 'mli-kapton', name: '镀铝聚酰亚胺 MLI', designation: 'Aluminized Kapton MLI', composition: 'Al/聚酰亚胺多层膜', family: '光机与热控',
    missions: ['卫星平台', '深空探测', '低轨星座'], applications: ['多层隔热', '热控包覆', '推进管路隔热'], maxServiceTempC: 200, density: '系统面密度计', evidence: '在役/遗产', trl: 9,
    advantages: ['高真空隔热效率', '柔性轻量'], watchouts: ['压实度/层数/边缘漏热', '原子氧与静电'], qualification: ['有效发射率', '放气', '原子氧/充放电'], sourceLabel: 'NASA Outgassing / MISSE', sourceUrl: NASA_OUTGASSING,
  },
  {
    id: 'beta-cloth', name: 'Beta Cloth', designation: 'PTFE-coated silica fabric', composition: 'PTFE 涂覆石英纤维', family: '光机与热控',
    missions: ['卫星平台', '低轨星座'], applications: ['外表面热控', 'MLI 外层', '防火/防原子氧织物'], maxServiceTempC: 290, density: '面密度随规格', evidence: '在役/遗产', trl: 9,
    advantages: ['耐温阻燃', '空间外表面遗产'], watchouts: ['折叠磨损', '污染与表面光学性能变化'], qualification: ['太阳吸收率/发射率', '原子氧', '热循环'], sourceLabel: 'NASA MISSE / MAPTIS', sourceUrl: NASA_MAPTIS,
  },
  {
    id: 'gan', name: '氮化镓宽禁带半导体', designation: 'GaN', composition: 'GaN', searchFormula: 'GaN', family: '电子封装',
    missions: ['卫星平台', '低轨星座', '深空探测'], applications: ['高频功放', '电源变换', '相控阵射频'], maxServiceTempC: 250, density: '6.15 g/cm³', evidence: '工程成熟', trl: 7,
    advantages: ['高功率密度', '高频', '高击穿场'], watchouts: ['总电离剂量/单粒子效应需器件级验证', '热管理'], qualification: ['TID/SEE', '功率循环', '封装热阻'], sourceLabel: 'NASA electronics / NTRS', sourceUrl: NASA_NTRS,
  },
  {
    id: 'sic-electronics', name: '碳化硅宽禁带半导体', designation: '4H-SiC', composition: 'SiC', searchFormula: 'SiC', family: '电子封装',
    missions: ['液体发动机', '卫星平台', '深空探测'], applications: ['高温传感', '高压功率器件', '电推进电源'], maxServiceTempC: 300, density: '3.21 g/cm³', evidence: '工程成熟', trl: 7,
    advantages: ['高温高压能力', '高导热', '辐照潜力'], watchouts: ['栅氧/界面可靠性', '封装成为温度瓶颈'], qualification: ['TID/SEE', '高温偏压', '封装热循环'], sourceLabel: 'NASA electronics / structure databases', sourceUrl: NASA_NTRS,
  },
];

export const AEROSPACE_OFFICIAL_SOURCES: AerospaceOfficialSource[] = [
  { id: 'nasa-outgassing', name: 'Spacecraft Materials Outgassing', organization: 'NASA GSFC', access: '公开', coverage: 'ASTM E595 真空放气，TML/CVCM 工程筛选入口。', url: NASA_OUTGASSING },
  { id: 'nasa-maptis', name: 'MAPTIS', organization: 'NASA', access: '注册/申请', coverage: '材料选用、试验、MISSE、受限物质与商业手册入口。', url: NASA_MAPTIS },
  { id: 'nasa-misse', name: 'MISSE Space Exposure', organization: 'NASA', access: '注册/申请', coverage: '低轨原子氧、紫外、热循环与长期暴露试验数据。', url: 'https://www.nasa.gov/news-release/nasa-launches-comprehensive-database-of-materials-tested-on-international-space-station/' },
  { id: 'nasa-tps', name: 'Thermal Protection Materials', organization: 'NASA Ames/JSC', access: '公开', coverage: 'PICA、TUFROC、隔热瓦、热响应与地面试验能力。', url: NASA_TPS },
  { id: 'nasa-ntrs', name: 'NASA Technical Reports Server', organization: 'NASA', access: '公开', coverage: '推进、热防护、增材制造和材料试验技术报告。', url: NASA_NTRS },
  { id: 'ecss-q70', name: 'ECSS-Q-ST-70 Materials & Processes', organization: 'ESA / ECSS', access: '标准/许可', coverage: '欧洲航天材料、机械部件与工艺保证框架。', url: 'https://ecss.nl/standard/ecss-q-st-70c-rev-2-materials-mechanical-parts-and-processes-15-september-2022/' },
  { id: 'nist-jarvis', name: 'JARVIS-DFT', organization: 'NIST', access: '公开', coverage: '无机晶体结构与计算性质，可用于陶瓷、涂层和电子材料初筛。', url: 'https://jarvis.nist.gov/' },
  { id: 'materials-project', name: 'Materials Project', organization: 'DOE / LBNL', access: '公开', coverage: '无机晶体结构、稳定性与基础计算性质。', url: 'https://materialsproject.org/' },
];
