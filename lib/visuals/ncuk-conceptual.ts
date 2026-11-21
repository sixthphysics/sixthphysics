import type {
  DomainRenderOptions,
  DomainRenderOutput,
  DomainSolveOutput,
  DomainValidationResult,
} from "@/lib/bank-pipeline/domain-registry";
import type { PhysicsDomainId, VerifiedQuantityMap } from "@/lib/bank-pipeline/types";

export const NCUK_GRAVITY_MS2 = 9.81;
export const NCUK_KELVIN_OFFSET = 273.2;

export interface DomainKindFieldSchema {
  readonly name: string;
  readonly type: string;
  readonly unit?: string;
  readonly bounds?: string;
  readonly enumValues?: readonly string[];
  readonly notes?: string;
}

export interface DomainKindPlugin {
  readonly domain: PhysicsDomainId;
  readonly kind: string;
  readonly summary: string;
  readonly requiredFields: readonly DomainKindFieldSchema[];
  readonly optionalFields?: readonly DomainKindFieldSchema[];
  readonly physicalConstraints: readonly string[];
  readonly probeSpecs: readonly Record<string, unknown>[];
  readonly validate: (spec: Record<string, unknown>) => DomainValidationResult;
  readonly solve: (spec: Record<string, unknown>) => DomainSolveOutput;
  readonly renderSvg?: (
    spec: Record<string, unknown>,
    options?: DomainRenderOptions,
  ) => DomainRenderOutput | undefined;
}

export const NCUK_QUAL_EXAM_SCENARIO_KINDS = [
  "conceptual-classification",
  "false-origin-gradient-experiment",
  "thermal-phase-cooling-gas-10m",
  "synoptic-density-statics-energy-10m",
] as const;

export type NcukQualExamScenarioKind =
  (typeof NCUK_QUAL_EXAM_SCENARIO_KINDS)[number];

export const NCUK_CONCEPTUAL_TOPIC_AREAS = [
  "ac1-units-uncertainty",
  "ac2-mechanics-materials",
  "ac3-thermal-matter",
  "ac4-electricity-capacitance",
  "s2-shm-em",
] as const;

export type NcukConceptualTopicArea =
  (typeof NCUK_CONCEPTUAL_TOPIC_AREAS)[number];

export const NCUK_CONCEPTUAL_PROMPT_MODES = [
  "mcq",
  "define",
  "explain",
  "state-and-explain",
  "sketch-describe",
  "without-calculation",
] as const;

export type NcukConceptualPromptMode =
  (typeof NCUK_CONCEPTUAL_PROMPT_MODES)[number];

export interface NcukConceptualRuleEntry {
  readonly conceptKey: string;
  readonly topicArea: NcukConceptualTopicArea;
  readonly conceptId: string;
  readonly templateArchetype: string;
  readonly ncukTopicId: string;
  readonly ncukSubtopicId: string;
  readonly ncukLevel: "IFY-S1" | "IFY-S2";
  readonly title: string;
  readonly primaryClassification: string;
  readonly requiredMarkPointA: string;
  readonly requiredMarkPointB: string;
  readonly requiredMarkPointC: string;
  readonly reasoningAnchor: string;
  readonly trapMisconception: string;
}

/**
 * Deterministic NCUK IFYPH005 conceptual and qualitative mark-point rule table.
 * Every string field intentionally avoids bare numerals so qualitative checks
 * remain strictly conceptual and compatible with deterministic gate guards.
 */
export const NCUK_CONCEPTUAL_RULE_TABLE: readonly NcukConceptualRuleEntry[] = [
  // -------------------------------------------------------------------------
  // GROUP A: Electrical units, ideal meters & conduction (AC4.1 / AC1.1)
  // -------------------------------------------------------------------------
  {
    conceptKey: "volt-unit-equivalence",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "si-units-dimensional-analysis",
    templateArchetype: "ncuk-electrical-units-ideal-meters",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-1",
    ncukLevel: "IFY-S1",
    title: "Equivalent SI expressions for the volt",
    primaryClassification: "joule per coulomb and newton metre per coulomb",
    requiredMarkPointA: "energy transferred per unit charge gives joule per coulomb",
    requiredMarkPointB: "replacing joule with newton metre and coulomb with ampere second yields joule per ampere second",
    requiredMarkPointC: "newton per coulomb represents electric field strength rather than potential difference",
    reasoningAnchor: "potential difference equals work done per unit charge",
    trapMisconception: "confusing newton per coulomb for electric field strength with potential difference",
  },
  {
    conceptKey: "ohm-unit-equivalence",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "si-units-dimensional-analysis",
    templateArchetype: "ncuk-electrical-units-ideal-meters",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-1",
    ncukLevel: "IFY-S1",
    title: "Equivalent SI expressions for the ohm",
    primaryClassification: "volt per ampere and joule second per coulomb squared",
    requiredMarkPointA: "resistance equals potential difference divided by current giving volt per ampere",
    requiredMarkPointB: "substituting joule per coulomb for volt and coulomb per second for ampere gives joule second per coulomb squared",
    requiredMarkPointC: "base unit form combines kilogram metre squared per second cubed per ampere squared",
    reasoningAnchor: "resistance is potential difference divided by current",
    trapMisconception: "inverting the ratio to ampere per volt which represents conductance",
  },
  {
    conceptKey: "farad-watt-unit-equivalence",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "si-units-dimensional-analysis",
    templateArchetype: "ncuk-electrical-units-ideal-meters",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-4",
    ncukLevel: "IFY-S1",
    title: "Equivalent SI units for farad and watt",
    primaryClassification: "coulomb per volt for capacitance and joule per second for power",
    requiredMarkPointA: "capacitance equals charge stored per unit potential difference giving coulomb per volt",
    requiredMarkPointB: "power equals rate of energy transfer giving joule per second or volt ampere",
    requiredMarkPointC: "ampere second per volt is equivalent to the farad",
    reasoningAnchor: "coulomb equals ampere second while watt equals joule per second",
    trapMisconception: "multiplying charge by potential difference instead of dividing charge by potential difference",
  },
  {
    conceptKey: "ideal-voltmeter-connection",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "charge-current-potential-difference",
    templateArchetype: "ncuk-electrical-units-ideal-meters",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-1",
    ncukLevel: "IFY-S1",
    title: "Ideal voltmeter connection and resistance",
    primaryClassification: "connected in parallel with infinite resistance",
    requiredMarkPointA: "connected in parallel across the component being measured",
    requiredMarkPointB: "infinite internal resistance ensures negligible current is diverted through the voltmeter",
    requiredMarkPointC: "the circuit current and potential difference across the component remain unchanged",
    reasoningAnchor: "parallel connection with infinite resistance draws zero current",
    trapMisconception: "connecting a voltmeter in series or assuming an ideal voltmeter has zero resistance",
  },
  {
    conceptKey: "ideal-ammeter-connection",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "charge-current-potential-difference",
    templateArchetype: "ncuk-electrical-units-ideal-meters",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-1",
    ncukLevel: "IFY-S1",
    title: "Ideal ammeter connection and resistance",
    primaryClassification: "connected in series with zero resistance",
    requiredMarkPointA: "connected in series with the branch carrying the current",
    requiredMarkPointB: "zero internal resistance ensures no potential difference is dropped across the ammeter",
    requiredMarkPointC: "the total circuit resistance and measured current remain unaltered",
    reasoningAnchor: "series connection with zero resistance introduces no extra voltage drop",
    trapMisconception: "connecting an ammeter in parallel or assigning infinite resistance to an ammeter",
  },
  {
    conceptKey: "electron-drift-vs-conventional-current",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "charge-current-potential-difference",
    templateArchetype: "ncuk-current-charge-meter-definitions",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-1",
    ncukLevel: "IFY-S1",
    title: "Conduction electron drift relative to conventional current",
    primaryClassification: "electrons drift slowly opposite to conventional current",
    requiredMarkPointA: "conduction electrons carry negative charge and drift opposite to conventional current",
    requiredMarkPointB: "electrons move from the negative terminal toward the positive terminal of the supply",
    requiredMarkPointC: "mean drift velocity is very small even though the electric field establishes rapidly along the wire",
    reasoningAnchor: "conventional current tracks positive charge flow so negative electrons move the opposite way",
    trapMisconception: "assuming free electrons move in the same direction as conventional current at the speed of light",
  },

  // -------------------------------------------------------------------------
  // GROUP B: Canonical NCUK Jan Exam Definitions (27 high-precision entries)
  // -------------------------------------------------------------------------
  {
    conceptKey: "def-coulomb",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "charge-current-potential-difference",
    templateArchetype: "ncuk-current-charge-meter-definitions",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-1",
    ncukLevel: "IFY-S1",
    title: "Definition of the coulomb",
    primaryClassification: "charge passing a point when a steady current of one ampere flows for one second",
    requiredMarkPointA: "quantity of electric charge passing a cross section",
    requiredMarkPointB: "when a steady current of one ampere flows for one second",
    requiredMarkPointC: "expressed symbolically as charge equals current multiplied by time",
    reasoningAnchor: "coulomb links electric charge to ampere and second",
    trapMisconception: "defining the coulomb as charge per second which actually defines the ampere",
  },
  {
    conceptKey: "def-volt",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "charge-current-potential-difference",
    templateArchetype: "ncuk-current-charge-meter-definitions",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-1",
    ncukLevel: "IFY-S1",
    title: "Definition of the volt",
    primaryClassification: "potential difference when one joule of energy is transferred per coulomb of charge",
    requiredMarkPointA: "energy transferred per unit charge between two points",
    requiredMarkPointB: "one joule of electrical energy transferred to other forms for each coulomb passing",
    requiredMarkPointC: "equivalent to one watt dissipated per ampere of current",
    reasoningAnchor: "potential difference is work done per unit charge",
    trapMisconception: "defining the volt as force per unit charge instead of energy per unit charge",
  },
  {
    conceptKey: "def-emf-vs-pd",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "emf-internal-resistance",
    templateArchetype: "ncuk-emf-pd-lost-volts-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-3",
    ncukLevel: "IFY-S1",
    title: "Distinction between electromotive force and potential difference",
    primaryClassification: "electromotive force transfers energy to charge in a source whereas potential difference transfers electrical energy from charge to components",
    requiredMarkPointA: "electromotive force is energy converted from chemical or non electrical forms into electrical energy per unit charge",
    requiredMarkPointB: "potential difference is electrical energy transferred into thermal or other forms per unit charge across a component",
    requiredMarkPointC: "internal resistance dissipates energy inside the source causing lost volts so terminal potential difference falls below electromotive force under load",
    reasoningAnchor: "direction of energy conversion distinguishes a source from a load",
    trapMisconception: "treating electromotive force as a mechanical force measured in newtons",
  },
  {
    conceptKey: "def-ohm",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "ohms-law-iv-characteristics",
    templateArchetype: "ncuk-non-ohmic-component-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-2",
    ncukLevel: "IFY-S1",
    title: "Definition of the ohm",
    primaryClassification: "resistance of a conductor carrying a current of one ampere under a potential difference of one volt",
    requiredMarkPointA: "ratio of potential difference to current equal to one volt per ampere",
    requiredMarkPointB: "steady current of one ampere flows when potential difference across the conductor is one volt",
    requiredMarkPointC: "resistance applies at that operating point whether ohmic or non ohmic",
    reasoningAnchor: "ohm is one volt per ampere",
    trapMisconception: "stating that the ohm requires current to remain proportional to voltage at all temperatures",
  },
  {
    conceptKey: "def-resistance",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "ohms-law-iv-characteristics",
    templateArchetype: "ncuk-non-ohmic-component-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-2",
    ncukLevel: "IFY-S1",
    title: "Definition of electrical resistance",
    primaryClassification: "ratio of potential difference across a component to the current flowing through it",
    requiredMarkPointA: "potential difference across the component divided by the current through it",
    requiredMarkPointB: "evaluated from the coordinate ratio rather than the reciprocal of the tangent gradient on a curved graph",
    requiredMarkPointC: "measured in ohms equivalent to volts per ampere",
    reasoningAnchor: "resistance is defined by the direct ratio of voltage to current",
    trapMisconception: "using the inverse tangent slope on a curved filament lamp characteristic to find static resistance",
  },
  {
    conceptKey: "def-resistivity",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "resistivity-ohmic-conductors",
    templateArchetype: "ncuk-resistivity-ohmic-precautions",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-2",
    ncukLevel: "IFY-S1",
    title: "Definition of electrical resistivity",
    primaryClassification: "resistance of a specimen of unit length and unit cross sectional area",
    requiredMarkPointA: "product of resistance and cross sectional area divided by length",
    requiredMarkPointB: "material property independent of sample dimensions at constant temperature",
    requiredMarkPointC: "measured in ohm metres",
    reasoningAnchor: "resistivity depends on the material and temperature rather than wire geometry",
    trapMisconception: "writing ohm per metre as the unit of resistivity or claiming cutting a wire changes its resistivity",
  },
  {
    conceptKey: "def-watt",
    topicArea: "ac2-mechanics-materials",
    conceptId: "work-energy-power",
    templateArchetype: "ncuk-work-power-energy-definitions",
    ncukTopicId: "ncuk-ac2",
    ncukSubtopicId: "ncuk-ac2-5",
    ncukLevel: "IFY-S1",
    title: "Definition of the watt",
    primaryClassification: "rate of energy transfer of one joule per second",
    requiredMarkPointA: "energy transferred or work done per unit time",
    requiredMarkPointB: "one joule of energy transferred every second",
    requiredMarkPointC: "equivalent to one volt ampere in an electrical circuit",
    reasoningAnchor: "power is energy transferred divided by time taken",
    trapMisconception: "confusing power in watts with total energy in joules",
  },
  {
    conceptKey: "def-newton-and-joule",
    topicArea: "ac2-mechanics-materials",
    conceptId: "work-energy-power",
    templateArchetype: "ncuk-work-power-energy-definitions",
    ncukTopicId: "ncuk-ac2",
    ncukSubtopicId: "ncuk-ac2-5",
    ncukLevel: "IFY-S1",
    title: "Definitions of the newton and the joule",
    primaryClassification: "force giving unit mass unit acceleration and work done by unit force over unit distance in its direction",
    requiredMarkPointA: "one newton gives a mass of one kilogram an acceleration of one metre per second squared",
    requiredMarkPointB: "one joule is the work done when a force of one newton moves its point of application one metre in the direction of the force",
    requiredMarkPointC: "displacement must be resolved parallel to the force when computing mechanical work",
    reasoningAnchor: "mechanical work requires displacement in the direction of the applied force",
    trapMisconception: "omitting the direction requirement when defining mechanical work and the joule",
  },
  {
    conceptKey: "def-farad",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "capacitor-networks-energy",
    templateArchetype: "ncuk-capacitance-rc-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-4",
    ncukLevel: "IFY-S1",
    title: "Definition of the farad",
    primaryClassification: "capacitance storing one coulomb of charge per volt of potential difference across the plates",
    requiredMarkPointA: "charge stored on one plate per unit potential difference across the capacitor",
    requiredMarkPointB: "one coulomb of charge stored when potential difference across the plates is one volt",
    requiredMarkPointC: "capacitance of a given geometry is constant and independent of applied voltage",
    reasoningAnchor: "capacitance equals charge stored divided by potential difference",
    trapMisconception: "defining the farad as energy stored per volt rather than charge stored per volt",
  },
  {
    conceptKey: "def-kirchhoff-first",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "ncuk-kirchhoff-conservation-laws",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-1",
    ncukLevel: "IFY-S1",
    title: "Kirchhoff first law and conservation principle",
    primaryClassification: "sum of currents entering a junction equals sum leaving expressing conservation of charge",
    requiredMarkPointA: "algebraic sum of currents meeting at any circuit junction is zero",
    requiredMarkPointB: "consequence of conservation of electric charge because charge cannot accumulate at a junction",
    requiredMarkPointC: "total rate of charge arrival equals total rate of charge departure",
    reasoningAnchor: "junction current rule follows directly from charge conservation",
    trapMisconception: "attributing the junction rule to conservation of energy instead of conservation of charge",
  },
  {
    conceptKey: "def-kirchhoff-second",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "kirchhoff-dc-circuits",
    templateArchetype: "ncuk-kirchhoff-conservation-laws",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-1",
    ncukLevel: "IFY-S1",
    title: "Kirchhoff second law and conservation principle",
    primaryClassification: "sum of electromotive forces equals sum of potential differences around a closed loop expressing conservation of energy",
    requiredMarkPointA: "around any closed loop the algebraic sum of electromotive forces equals the sum of potential differences",
    requiredMarkPointB: "consequence of conservation of energy for unit charge travelling completely around the loop",
    requiredMarkPointC: "opposing cells subtract algebraically when traversing the loop in a consistent direction",
    reasoningAnchor: "loop voltage rule follows directly from energy conservation per unit charge",
    trapMisconception: "attributing the closed loop voltage rule to conservation of charge",
  },
  {
    conceptKey: "def-moment",
    topicArea: "ac2-mechanics-materials",
    conceptId: "vectors-equilibrium-moments",
    templateArchetype: "ncuk-statics-definitions-scalars-vectors",
    ncukTopicId: "ncuk-ac2",
    ncukSubtopicId: "ncuk-ac2-3",
    ncukLevel: "IFY-S1",
    title: "Definition of the moment of a force",
    primaryClassification: "product of force and perpendicular distance from pivot to the line of action of the force",
    requiredMarkPointA: "product of the magnitude of the force and distance from the pivot",
    requiredMarkPointB: "distance must be the perpendicular distance from the pivot to the line of action of the force",
    requiredMarkPointC: "measured in newton metres which is a turning effect rather than mechanical work in joules",
    reasoningAnchor: "perpendicular distance to the line of action is essential for a moment",
    trapMisconception: "omitting the word perpendicular and multiplying force by slanted distance along a rod",
  },
  {
    conceptKey: "def-principle-of-moments",
    topicArea: "ac2-mechanics-materials",
    conceptId: "vectors-equilibrium-moments",
    templateArchetype: "ncuk-statics-definitions-scalars-vectors",
    ncukTopicId: "ncuk-ac2",
    ncukSubtopicId: "ncuk-ac2-3",
    ncukLevel: "IFY-S1",
    title: "Principle of moments and equilibrium conditions",
    primaryClassification: "for a body in equilibrium the sum of clockwise moments equals the sum of anticlockwise moments about any pivot",
    requiredMarkPointA: "sum of clockwise moments equals sum of anticlockwise moments about any point",
    requiredMarkPointB: "complete rigid body equilibrium also requires zero resultant force in any direction",
    requiredMarkPointC: "choosing the pivot at an unknown reaction eliminates that force from the moment equation",
    reasoningAnchor: "rotational equilibrium balances clockwise and anticlockwise turning effects",
    trapMisconception: "assuming zero resultant moment alone guarantees equilibrium even when resultant force is non zero",
  },
  {
    conceptKey: "def-centre-of-gravity",
    topicArea: "ac2-mechanics-materials",
    conceptId: "vectors-equilibrium-moments",
    templateArchetype: "ncuk-statics-definitions-scalars-vectors",
    ncukTopicId: "ncuk-ac2",
    ncukSubtopicId: "ncuk-ac2-3",
    ncukLevel: "IFY-S1",
    title: "Definition of centre of gravity",
    primaryClassification: "point through which the entire weight of a body appears to act",
    requiredMarkPointA: "single point through which the entire weight of the object may be considered to act",
    requiredMarkPointB: "in a uniform gravitational field this coincides with the centre of mass",
    requiredMarkPointC: "for a uniform symmetrical body the centre of gravity lies at its geometric centre",
    reasoningAnchor: "all gravitational torque acts as if total weight is concentrated at the centre of gravity",
    trapMisconception: "claiming the centre of gravity must always lie inside solid material of the object",
  },
  {
    conceptKey: "def-scalar-vs-vector",
    topicArea: "ac1-units-uncertainty",
    conceptId: "vectors-equilibrium-moments",
    templateArchetype: "ncuk-statics-definitions-scalars-vectors",
    ncukTopicId: "ncuk-ac1",
    ncukSubtopicId: "ncuk-ac1-3",
    ncukLevel: "IFY-S1",
    title: "Distinction between scalar and vector quantities",
    primaryClassification: "scalar has magnitude only whereas vector has both magnitude and direction",
    requiredMarkPointA: "scalar quantity is completely specified by magnitude alone such as mass energy speed or temperature",
    requiredMarkPointB: "vector quantity possesses both magnitude and direction such as displacement velocity force momentum or acceleration",
    requiredMarkPointC: "vectors combine geometrically by triangle or component addition rather than plain arithmetic",
    reasoningAnchor: "direction distinguishes vector quantities from scalar quantities",
    trapMisconception: "classifying work done, energy, or pressure as vectors instead of scalars",
  },
  {
    conceptKey: "def-momentum-conservation",
    topicArea: "ac2-mechanics-materials",
    conceptId: "linear-momentum-impulse",
    templateArchetype: "ncuk-momentum-collision-concepts",
    ncukTopicId: "ncuk-ac2",
    ncukSubtopicId: "ncuk-ac2-6",
    ncukLevel: "IFY-S1",
    title: "Principle of conservation of linear momentum",
    primaryClassification: "total linear momentum before equals total linear momentum after provided no external resultant force acts",
    requiredMarkPointA: "total linear momentum before an interaction equals total linear momentum after",
    requiredMarkPointB: "applies only to an isolated system with no external resultant force acting",
    requiredMarkPointC: "momentum is a vector so opposite directions carry opposite signs",
    reasoningAnchor: "zero external resultant force ensures total system momentum stays constant",
    trapMisconception: "omitting the isolated system condition of no external resultant force",
  },
  {
    conceptKey: "def-tensile-stress",
    topicArea: "ac3-thermal-matter",
    conceptId: "elasticity-young-modulus",
    templateArchetype: "ncuk-materials-stress-modulus-definitions",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-2",
    ncukLevel: "IFY-S1",
    title: "Definition of tensile stress",
    primaryClassification: "tensile force acting per unit cross sectional area",
    requiredMarkPointA: "tensile force divided by area",
    requiredMarkPointB: "area must be specified explicitly as cross sectional area perpendicular to the applied force",
    requiredMarkPointC: "measured in pascals or newtons per metre squared",
    reasoningAnchor: "cross sectional area distinguishes tensile stress from surface area pressure",
    trapMisconception: "writing force per unit area without specifying cross sectional area",
  },
  {
    conceptKey: "def-young-modulus",
    topicArea: "ac3-thermal-matter",
    conceptId: "elasticity-young-modulus",
    templateArchetype: "ncuk-materials-stress-modulus-definitions",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-2",
    ncukLevel: "IFY-S1",
    title: "Definition of Young modulus",
    primaryClassification: "ratio of tensile stress to tensile strain within the linear elastic region",
    requiredMarkPointA: "tensile stress divided by tensile strain",
    requiredMarkPointB: "valid only within the linear elastic region where Hooke law is obeyed",
    requiredMarkPointC: "equals the gradient of the initial straight line region of a stress against strain graph",
    reasoningAnchor: "stiffness of a material is measured by stress over strain up to the limit of proportionality",
    trapMisconception: "defining Young modulus as force divided by extension which is spring stiffness rather than a material constant",
  },
  {
    conceptKey: "def-elastic-limit",
    topicArea: "ac3-thermal-matter",
    conceptId: "elasticity-young-modulus",
    templateArchetype: "ncuk-materials-stress-modulus-definitions",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-2",
    ncukLevel: "IFY-S1",
    title: "Definition of elastic limit and plastic deformation",
    primaryClassification: "maximum stress or load beyond which permanent plastic deformation occurs when unloaded",
    requiredMarkPointA: "maximum force or stress a material can withstand and still return completely to its original length upon unloading",
    requiredMarkPointB: "exceeding the elastic limit leaves a permanent extension due to plastic deformation",
    requiredMarkPointC: "the limit of proportionality is where stress ceases to be directly proportional to strain",
    reasoningAnchor: "elastic behaviour means complete recovery of original dimensions on removing load",
    trapMisconception: "equating the elastic limit with the breaking point where fracture occurs",
  },
  {
    conceptKey: "def-specific-heat-capacity",
    topicArea: "ac3-thermal-matter",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "ncuk-thermal-definitions-phase-plateau",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-3",
    ncukLevel: "IFY-S1",
    title: "Definition of specific heat capacity",
    primaryClassification: "thermal energy required per unit mass to raise temperature by one kelvin without change of state",
    requiredMarkPointA: "thermal energy supplied per unit mass per unit temperature rise",
    requiredMarkPointB: "temperature rises by one kelvin with no change of physical state",
    requiredMarkPointC: "measured in joules per kilogram per kelvin",
    reasoningAnchor: "specific means per unit mass and excludes phase transitions",
    trapMisconception: "omitting per unit mass and defining total heat capacity instead of specific heat capacity",
  },
  {
    conceptKey: "def-specific-latent-heat",
    topicArea: "ac3-thermal-matter",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "ncuk-thermal-definitions-phase-plateau",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-3",
    ncukLevel: "IFY-S1",
    title: "Definition of specific latent heat",
    primaryClassification: "thermal energy required per unit mass to change state at constant temperature",
    requiredMarkPointA: "thermal energy needed per unit mass to convert between solid and liquid or liquid and vapour",
    requiredMarkPointB: "state change occurs completely at constant temperature",
    requiredMarkPointC: "specific latent heat of vaporisation exceeds fusion because intermolecular bonds are completely broken and work is done expanding against atmospheric pressure",
    reasoningAnchor: "latent heat changes molecular potential energy without changing temperature",
    trapMisconception: "including a temperature rise in the definition of specific latent heat",
  },
  {
    conceptKey: "def-internal-energy",
    topicArea: "ac3-thermal-matter",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "ncuk-thermal-definitions-phase-plateau",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-3",
    ncukLevel: "IFY-S1",
    title: "Definition of internal energy",
    primaryClassification: "sum of random kinetic energies and intermolecular potential energies of all molecules",
    requiredMarkPointA: "sum of random distribution of kinetic energies of all molecules in the system",
    requiredMarkPointB: "plus the sum of intermolecular potential energies due to forces between molecules",
    requiredMarkPointC: "for an ideal gas intermolecular potential energy is zero so internal energy depends solely on absolute temperature",
    reasoningAnchor: "internal energy combines microscopic random kinetic energy and molecular potential energy",
    trapMisconception: "counting bulk macroscopic kinetic energy of a moving container as internal energy",
  },
  {
    conceptKey: "def-boyle-law",
    topicArea: "ac3-thermal-matter",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "ncuk-gas-laws-kinetic-pressure",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-4",
    ncukLevel: "IFY-S1",
    title: "Boyle law and required controlled variables",
    primaryClassification: "for a fixed mass of ideal gas at constant temperature pressure is inversely proportional to volume",
    requiredMarkPointA: "pressure is inversely proportional to volume so their product stays constant",
    requiredMarkPointB: "requires both a fixed mass of gas and constant temperature",
    requiredMarkPointC: "plotting pressure against reciprocal volume produces a straight line through the origin",
    reasoningAnchor: "isothermal compression of a fixed mass keeps pressure times volume constant",
    trapMisconception: "stating pressure is inversely proportional to volume without specifying fixed mass and constant temperature",
  },
  {
    conceptKey: "def-pressure-law",
    topicArea: "ac3-thermal-matter",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "ncuk-gas-laws-kinetic-pressure",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-4",
    ncukLevel: "IFY-S1",
    title: "Pressure law and thermodynamic kelvin scale",
    primaryClassification: "for a fixed mass of ideal gas at constant volume pressure is directly proportional to absolute temperature in kelvin",
    requiredMarkPointA: "pressure is directly proportional to thermodynamic temperature measured in kelvin",
    requiredMarkPointB: "requires a fixed mass of gas kept at constant volume",
    requiredMarkPointC: "pressure is linear with Celsius temperature but not directly proportional to Celsius temperature",
    reasoningAnchor: "direct proportionality requires absolute kelvin temperature at constant volume and fixed mass",
    trapMisconception: "claiming gas pressure is directly proportional to temperature in degrees Celsius",
  },
  {
    conceptKey: "def-charles-law",
    topicArea: "ac3-thermal-matter",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "ncuk-gas-laws-kinetic-pressure",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-4",
    ncukLevel: "IFY-S1",
    title: "Charles law and controlled variables",
    primaryClassification: "for a fixed mass of ideal gas at constant pressure volume is directly proportional to absolute temperature in kelvin",
    requiredMarkPointA: "volume is directly proportional to absolute temperature measured in kelvin",
    requiredMarkPointB: "requires both a fixed mass of gas and constant pressure",
    requiredMarkPointC: "extrapolating the volume against Celsius line back to zero volume locates absolute zero",
    reasoningAnchor: "isobaric expansion scales volume directly with absolute kelvin temperature",
    trapMisconception: "omitting constant pressure or stating proportionality to Celsius temperature",
  },
  {
    conceptKey: "def-shm",
    topicArea: "s2-shm-em",
    conceptId: "simple-harmonic-motion",
    templateArchetype: "ncuk-shm-definition-qual",
    ncukTopicId: "ncuk-ac6",
    ncukSubtopicId: "ncuk-ac6-1",
    ncukLevel: "IFY-S2",
    title: "Definition of simple harmonic motion",
    primaryClassification: "acceleration is directly proportional to displacement from a fixed equilibrium position and always directed toward it",
    requiredMarkPointA: "acceleration is directly proportional to displacement from a fixed equilibrium point",
    requiredMarkPointB: "acceleration is always directed opposite to displacement toward the equilibrium position",
    requiredMarkPointC: "a graph of acceleration against displacement is a straight line with negative gradient through the origin",
    reasoningAnchor: "restoring proportionality and inward direction together define simple harmonic motion",
    trapMisconception: "describing simple harmonic motion simply as any periodic back and forth motion without the proportionality condition",
  },
  {
    conceptKey: "def-lenz-law",
    topicArea: "s2-shm-em",
    conceptId: "electromagnetic-induction-faraday-lenz",
    templateArchetype: "ncuk-lenz-law-qual",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-6",
    ncukLevel: "IFY-S2",
    title: "Lenz law and conservation of energy",
    primaryClassification: "direction of induced electromotive force opposes the change in magnetic flux linkage producing it",
    requiredMarkPointA: "induced electromotive force or current acts in a direction that opposes the change producing it",
    requiredMarkPointB: "follows directly from conservation of energy because mechanical work must be done against the opposing magnetic force",
    requiredMarkPointC: "if the induced current assisted the motion kinetic and electrical energy would grow spontaneously from nothing",
    reasoningAnchor: "opposition to flux change preserves energy conservation during induction",
    trapMisconception: "stating that induced current opposes the magnetic field itself rather than the change in magnetic flux linkage",
  },

  // -------------------------------------------------------------------------
  // GROUP C: High-Precision NCUK Causal Explanations & Qualitative Physics
  // -------------------------------------------------------------------------
  {
    conceptKey: "causal-kinetic-gas-pressure",
    topicArea: "ac3-thermal-matter",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "ncuk-gas-laws-kinetic-pressure",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-4",
    ncukLevel: "IFY-S1",
    title: "Kinetic theory explanation of gas pressure increase using Newton second law",
    primaryClassification: "faster molecules produce larger momentum change per wall collision and higher collision frequency raising average force per unit area",
    requiredMarkPointA: "raising temperature increases mean molecular kinetic energy and average molecular speed",
    requiredMarkPointB: "molecules undergo a greater change in momentum during each elastic wall collision and strike the walls more frequently",
    requiredMarkPointC: "by Newton second law the greater rate of change of momentum produces a larger average force over the fixed wall area raising pressure",
    reasoningAnchor: "kinetic pressure arises from rate of momentum transfer to container walls rather than circular appeal to gas equations",
    trapMisconception: "offering a circular algebraic restatement of the ideal gas equation instead of molecular momentum transfer",
  },
  {
    conceptKey: "causal-terminal-velocity",
    topicArea: "ac2-mechanics-materials",
    conceptId: "newtonian-dynamics-friction",
    templateArchetype: "ncuk-terminal-velocity-dynamics-qual",
    ncukTopicId: "ncuk-ac2",
    ncukSubtopicId: "ncuk-ac2-2",
    ncukLevel: "IFY-S1",
    title: "Mechanism of reaching terminal velocity in a fluid",
    primaryClassification: "drag increases with speed until upward drag equals downward weight making resultant force and acceleration zero",
    requiredMarkPointA: "initially weight exceeds drag so the object accelerates downward and speed increases",
    requiredMarkPointB: "resistive drag force grows with speed reducing the downward resultant force and acceleration",
    requiredMarkPointC: "when upward drag equals downward weight resultant force becomes zero so velocity stays constant at terminal velocity",
    reasoningAnchor: "balance between speed dependent drag and constant weight yields zero acceleration",
    trapMisconception: "believing gravity decreases during the fall or that forces vanish completely at terminal velocity",
  },
  {
    conceptKey: "causal-phase-change-plateau",
    topicArea: "ac3-thermal-matter",
    conceptId: "specific-heat-latent-heat",
    templateArchetype: "ncuk-thermal-definitions-phase-plateau",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-3",
    ncukLevel: "IFY-S1",
    title: "Molecular explanation of constant temperature plateau during phase change",
    primaryClassification: "mean molecular kinetic energy stays constant while supplied energy increases internal potential energy by breaking bonds",
    requiredMarkPointA: "temperature and mean random molecular kinetic energy remain constant throughout the phase transition",
    requiredMarkPointB: "supplied thermal energy increases molecular potential energy by weakening or breaking intermolecular bonds",
    requiredMarkPointC: "total internal energy increases during melting even though the thermometer reading stays flat",
    reasoningAnchor: "temperature tracks mean kinetic energy whereas latent heat alters intermolecular potential energy",
    trapMisconception: "claiming internal energy stays constant whenever temperature stays constant",
  },
  {
    conceptKey: "causal-filament-lamp-non-ohmic",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "ohms-law-iv-characteristics",
    templateArchetype: "ncuk-non-ohmic-component-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-2",
    ncukLevel: "IFY-S1",
    title: "Microscopic cause of rising resistance in a filament lamp",
    primaryClassification: "higher temperature increases lattice ion vibration amplitude causing more frequent electron collisions and higher resistance",
    requiredMarkPointA: "greater current heats the metal filament raising its temperature",
    requiredMarkPointB: "metal lattice ions vibrate with larger amplitude so conduction electrons suffer more frequent collisions",
    requiredMarkPointC: "drift progression is impeded more strongly so resistance increases and the current against voltage curve flattens toward the voltage axis",
    reasoningAnchor: "larger lattice ion vibrations impede electron drift and raise metallic resistance",
    trapMisconception: "attributing rising lamp resistance to a loss of free electrons inside the metal wire",
  },
  {
    conceptKey: "causal-brownian-motion",
    topicArea: "ac3-thermal-matter",
    conceptId: "fluid-drag-buoyancy",
    templateArchetype: "ncuk-brownian-particle-model-qual",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-1",
    ncukLevel: "IFY-S1",
    title: "Molecular origin of Brownian motion in a smoke cell",
    primaryClassification: "uneven rapid collisions from much smaller invisible randomly moving air molecules transfer momentum to smoke specks",
    requiredMarkPointA: "bright specks undergo erratic zig zag random motion viewed under the microscope",
    requiredMarkPointB: "much smaller invisible air molecules moving rapidly in random directions collide unevenly with opposite sides of each speck",
    requiredMarkPointC: "net instantaneous momentum transfer fluctuates randomly in magnitude and direction providing evidence for molecular motion",
    reasoningAnchor: "unbalanced microscopic molecular impacts drive observable random speck jitter",
    trapMisconception: "explaining Brownian motion as convection currents or air molecules being directly visible through the microscope",
  },
  {
    conceptKey: "causal-isothermal-thin-wall",
    topicArea: "ac3-thermal-matter",
    conceptId: "ideal-gas-kinetic-theory",
    templateArchetype: "ncuk-gas-laws-kinetic-pressure",
    ncukTopicId: "ncuk-ac3",
    ncukSubtopicId: "ncuk-ac3-4",
    ncukLevel: "IFY-S1",
    title: "Experimental condition for an isothermal gas compression",
    primaryClassification: "compress slowly inside a thin conducting wall so thermal energy transfers to surroundings keeping temperature constant",
    requiredMarkPointA: "compression must be performed slowly to give sufficient time for thermal equilibration",
    requiredMarkPointB: "a thin conducting wall allows heat generated by work done on the gas to flow to the surroundings",
    requiredMarkPointC: "maintaining constant temperature preserves constant mean molecular kinetic energy so Boyle law applies",
    reasoningAnchor: "slow volume change across a conducting boundary maintains thermal equilibrium",
    trapMisconception: "using thick thermal insulation and rapid compression which produces an adiabatic temperature rise instead",
  },
  {
    conceptKey: "causal-elastic-vs-inelastic-collision",
    topicArea: "ac2-mechanics-materials",
    conceptId: "linear-momentum-impulse",
    templateArchetype: "ncuk-momentum-collision-concepts",
    ncukTopicId: "ncuk-ac2",
    ncukSubtopicId: "ncuk-ac2-6",
    ncukLevel: "IFY-S1",
    title: "Distinguishing elastic and inelastic collisions",
    primaryClassification: "linear momentum is conserved in both whereas total kinetic energy is conserved only in an elastic collision",
    requiredMarkPointA: "total linear momentum is conserved in every isolated collision regardless of elasticity",
    requiredMarkPointB: "total kinetic energy before equals total kinetic energy after only in an elastic collision",
    requiredMarkPointC: "in an inelastic collision kinetic energy decreases as energy transfers into internal heating deformation or sound",
    reasoningAnchor: "comparing total kinetic energy before and after tests whether a collision is elastic",
    trapMisconception: "claiming that momentum is not conserved during an inelastic collision",
  },
  {
    conceptKey: "causal-circular-motion-acceleration",
    topicArea: "ac2-mechanics-materials",
    conceptId: "uniform-circular-motion",
    templateArchetype: "ncuk-circular-motion-conceptual",
    ncukTopicId: "ncuk-ac2",
    ncukSubtopicId: "ncuk-ac2-4",
    ncukLevel: "IFY-S1",
    title: "Acceleration and zero work in uniform circular motion",
    primaryClassification: "velocity direction changes continuously so resultant centripetal force and acceleration act perpendicular to velocity toward the centre doing zero work",
    requiredMarkPointA: "velocity is a vector so constant speed along a circular path still involves continuous velocity change and acceleration",
    requiredMarkPointB: "resultant centripetal force and acceleration always point perpendicular to instantaneous velocity toward the centre of the circle",
    requiredMarkPointC: "because force is always perpendicular to instantaneous displacement the centripetal force does zero work and kinetic energy remains constant",
    reasoningAnchor: "centripetal force alters direction of velocity without changing speed",
    trapMisconception: "treating centrifugal force as a real outward physical force acting on the orbiting object",
  },
  {
    conceptKey: "causal-ohmic-heating-precaution",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "resistivity-ohmic-conductors",
    templateArchetype: "ncuk-resistivity-ohmic-precautions",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-2",
    ncukLevel: "IFY-S1",
    title: "Experimental precaution to keep a metal wire ohmic",
    primaryClassification: "use small currents and open the switch between readings to prevent Joule heating from changing wire temperature and resistance",
    requiredMarkPointA: "Ohm law applies only when temperature and physical conditions remain constant",
    requiredMarkPointB: "keeping currents small and switching off between readings minimises heating of the resistance wire",
    requiredMarkPointC: "preventing temperature rise keeps resistivity constant so current stays directly proportional to potential difference",
    reasoningAnchor: "limiting current prevents self heating from distorting a linear ohmic plot",
    trapMisconception: "using maximum supply current continuously to improve measurement accuracy",
  },
  {
    conceptKey: "causal-ntc-thermistor-divider",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "potential-divider-sensors",
    templateArchetype: "ncuk-sensor-divider-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-2",
    ncukLevel: "IFY-S1",
    title: "Qualitative response of a negative temperature coefficient thermistor divider",
    primaryClassification: "heating releases more charge carriers lowering thermistor resistance so its share of potential difference falls while the fixed resistor voltage rises",
    requiredMarkPointA: "higher temperature frees more charge carriers in the semiconductor reducing thermistor resistance",
    requiredMarkPointB: "total series resistance decreases so circuit current increases",
    requiredMarkPointC: "potential difference across the fixed series resistor rises while potential difference across the thermistor decreases",
    reasoningAnchor: "lower thermistor resistance shifts potential divider share onto the series fixed resistor",
    trapMisconception: "assuming a semiconductor thermistor behaves like a metal filament whose resistance increases with temperature",
  },
  {
    conceptKey: "causal-ldr-brightness-divider",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "potential-divider-sensors",
    templateArchetype: "ncuk-sensor-divider-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-2",
    ncukLevel: "IFY-S1",
    title: "Qualitative response of a light dependent resistor in a potential divider",
    primaryClassification: "brighter light releases more charge carriers reducing light dependent resistor resistance so circuit current rises and its voltage share decreases",
    requiredMarkPointA: "greater incident light intensity liberates more mobile charge carriers lowering resistance of the light dependent resistor",
    requiredMarkPointB: "total series resistance falls causing current in the divider chain to increase",
    requiredMarkPointC: "output potential difference across the light dependent resistor drops while output across the fixed series resistor rises",
    reasoningAnchor: "light lowers semiconductor resistance and redistributes series voltage share",
    trapMisconception: "claiming brighter illumination increases the resistance of a light dependent resistor",
  },
  {
    conceptKey: "causal-diode-led-characteristic",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "ohms-law-iv-characteristics",
    templateArchetype: "ncuk-non-ohmic-component-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-2",
    ncukLevel: "IFY-S1",
    title: "Semiconductor diode and light emitting diode characteristic behaviour",
    primaryClassification: "negligible current in reverse bias and below forward threshold followed by rapid current rise requiring a protective series resistor",
    requiredMarkPointA: "resistance is extremely high in reverse bias and below the forward threshold voltage so current is virtually zero",
    requiredMarkPointB: "above the forward threshold potential difference resistance falls sharply and current rises rapidly",
    requiredMarkPointC: "a protective series resistor is included to limit current and prevent thermal damage to the junction",
    reasoningAnchor: "asymmetric threshold conduction defines a semiconductor diode characteristic",
    trapMisconception: "expecting a symmetrical curve through the origin in both forward and reverse bias",
  },
  {
    conceptKey: "causal-random-vs-systematic-error",
    topicArea: "ac1-units-uncertainty",
    conceptId: "uncertainties-error-propagation",
    templateArchetype: "ncuk-errors-precision-qualitative",
    ncukTopicId: "ncuk-ac1",
    ncukSubtopicId: "ncuk-ac1-1",
    ncukLevel: "IFY-S1",
    title: "Distinguishing random errors from systematic errors",
    primaryClassification: "random errors scatter unpredictably and are reduced by repeating and averaging whereas systematic errors shift readings consistently and are not reduced by averaging",
    requiredMarkPointA: "random errors fluctuate unpredictably above and below the true value and can be reduced by taking repeat readings and averaging",
    requiredMarkPointB: "systematic errors such as zero offset bias every measurement consistently in the same direction",
    requiredMarkPointC: "averaging repeated measurements improves precision against random scatter but cannot remove a systematic zero error",
    reasoningAnchor: "repeat averaging reduces random scatter while calibration removes systematic offset",
    trapMisconception: "claiming that repeating measurements and computing a mean removes a zero error on a meter",
  },
  {
    conceptKey: "causal-rc-without-calculation-change",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "capacitor-rc-decay",
    templateArchetype: "ncuk-capacitance-rc-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-4",
    ncukLevel: "IFY-S1",
    title: "Effect of reducing resistance during capacitor discharge without calculation",
    primaryClassification: "smaller resistance reduces the time constant so initial current is larger and capacitor potential difference falls more rapidly",
    requiredMarkPointA: "time constant equals resistance multiplied by capacitance so lowering resistance reduces the time constant",
    requiredMarkPointB: "initial discharge current increases because initial voltage is divided by a smaller resistance",
    requiredMarkPointC: "charge leaves the plates more rapidly so after any given elapsed interval the remaining potential difference is lower",
    reasoningAnchor: "shorter time constant produces a steeper exponential decay curve",
    trapMisconception: "claiming a smaller discharge resistor increases the final stored energy or slows down the decay",
  },
  {
    conceptKey: "causal-iv-curve-gradient-trap",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "ohms-law-iv-characteristics",
    templateArchetype: "ncuk-non-ohmic-component-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-2",
    ncukLevel: "IFY-S1",
    title: "Interpreting axes and gradient on a current against potential difference graph",
    primaryClassification: "with current on the vertical axis the linear gradient equals the reciprocal of resistance while non ohmic resistance uses coordinate ratio",
    requiredMarkPointA: "plotting current on the vertical axis against potential difference on the horizontal axis gives a straight line gradient equal to reciprocal resistance",
    requiredMarkPointB: "therefore a steeper ohmic line corresponds to a smaller resistance",
    requiredMarkPointC: "for a curved non ohmic characteristic resistance at a point equals potential difference divided by current rather than inverse tangent gradient",
    reasoningAnchor: "current over voltage is conductance which is the reciprocal of resistance",
    trapMisconception: "assuming the gradient of a current against voltage graph equals resistance directly",
  },
  {
    conceptKey: "causal-internal-resistance-terminal-pd",
    topicArea: "ac4-electricity-capacitance",
    conceptId: "emf-internal-resistance",
    templateArchetype: "ncuk-emf-pd-lost-volts-qualitative",
    ncukTopicId: "ncuk-ac4",
    ncukSubtopicId: "ncuk-ac4-3",
    ncukLevel: "IFY-S1",
    title: "Effect of lowering external load resistance on terminal potential difference",
    primaryClassification: "lower external resistance increases circuit current raising lost volts across internal resistance so terminal potential difference decreases",
    requiredMarkPointA: "decreasing external load resistance lowers total circuit resistance and increases current drawn from the cell",
    requiredMarkPointB: "greater current produces a larger potential drop or lost volts across the internal resistance",
    requiredMarkPointC: "since cell electromotive force stays constant the measured terminal potential difference falls",
    reasoningAnchor: "terminal potential difference equals constant electromotive force minus internal lost volts",
    trapMisconception: "assuming terminal potential difference remains constant equal to electromotive force as load current increases",
  },
];

export const NCUK_CONCEPTUAL_RULE_MAP: ReadonlyMap<
  string,
  NcukConceptualRuleEntry
> = new Map(NCUK_CONCEPTUAL_RULE_TABLE.map((entry) => [entry.conceptKey, entry]));

// ============================================================================
// SHARED XML & FORMATTING HELPERS (ZERO RAW `_` OR `^` IN SVG TEXT!)
// ============================================================================

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return ch;
    }
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function coord(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function formatTickNum(value: number): string {
  if (Math.abs(value) < 1e-12) return "0";
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function formatCleanDim(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

// ============================================================================
// PLUGIN 1: conceptual-classification (pure-calculation)
// ============================================================================

function validateConceptualSpec(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "conceptual-classification") {
    issues.push('kind must equal "conceptual-classification"');
  }
  const topicArea = spec.topicArea;
  if (
    typeof topicArea !== "string" ||
    !(NCUK_CONCEPTUAL_TOPIC_AREAS as readonly string[]).includes(topicArea)
  ) {
    issues.push(
      `topicArea must be one of: ${NCUK_CONCEPTUAL_TOPIC_AREAS.join(", ")}`,
    );
  }
  const conceptKey = spec.conceptKey;
  if (typeof conceptKey !== "string" || !NCUK_CONCEPTUAL_RULE_MAP.has(conceptKey)) {
    issues.push(`Unknown conceptual conceptKey "${String(conceptKey)}"`);
  } else {
    const entry = NCUK_CONCEPTUAL_RULE_MAP.get(conceptKey)!;
    if (typeof topicArea === "string" && entry.topicArea !== topicArea) {
      issues.push(
        `conceptKey "${conceptKey}" belongs to topicArea "${entry.topicArea}", received "${topicArea}"`,
      );
    }
  }
  const variantIndex = spec.variantIndex;
  if (
    typeof variantIndex !== "number" ||
    !Number.isInteger(variantIndex) ||
    variantIndex < 0 ||
    variantIndex > 99
  ) {
    issues.push("variantIndex must be an integer in [0, 99]");
  }
  const promptMode = spec.promptMode;
  if (
    typeof promptMode !== "string" ||
    !(NCUK_CONCEPTUAL_PROMPT_MODES as readonly string[]).includes(promptMode)
  ) {
    issues.push(
      `promptMode must be one of: ${NCUK_CONCEPTUAL_PROMPT_MODES.join(", ")}`,
    );
  }
  return { valid: issues.length === 0, issues };
}

function solveConceptualSpec(spec: Record<string, unknown>): DomainSolveOutput {
  const check = validateConceptualSpec(spec);
  if (!check.valid) {
    throw new Error(check.issues.join("; "));
  }
  const entry = NCUK_CONCEPTUAL_RULE_MAP.get(String(spec.conceptKey))!;
  const promptMode = String(spec.promptMode);
  const quantities: VerifiedQuantityMap = {
    topicArea: entry.topicArea,
    conceptKey: entry.conceptKey,
    promptMode,
    primaryClassification: entry.primaryClassification,
    requiredMarkPointA: entry.requiredMarkPointA,
    requiredMarkPointB: entry.requiredMarkPointB,
    requiredMarkPointC: entry.requiredMarkPointC,
    reasoningAnchor: entry.reasoningAnchor,
    trapMisconception: entry.trapMisconception,
  };
  return {
    solverId: "sixthphysics/ncuk-conceptual-classification/1.0.0",
    quantities,
  };
}

const CONCEPTUAL_CLASSIFICATION_PLUGIN: DomainKindPlugin = {
  domain: "pure-calculation",
  kind: "conceptual-classification",
  summary:
    "Deterministic NCUK IFYPH005 rule-table solver for pure qualitative/conceptual MCQs, canonical Jan Exam definitions, ideal meters, unit equivalences, and high-precision causal explanation rubrics.",
  requiredFields: [
    {
      name: "topicArea",
      type: "string",
      enumValues: NCUK_CONCEPTUAL_TOPIC_AREAS,
      notes: "NCUK conceptual topic grouping",
    },
    {
      name: "conceptKey",
      type: "string",
      enumValues: NCUK_CONCEPTUAL_RULE_TABLE.map((e) => e.conceptKey),
      notes: "Canonical NCUK conceptual or definition identifier",
    },
    {
      name: "variantIndex",
      type: "integer",
      bounds: "0..99",
      notes: "Deterministic scenario phrasing index",
    },
    {
      name: "promptMode",
      type: "string",
      enumValues: NCUK_CONCEPTUAL_PROMPT_MODES,
      notes: "Target exam prompt style",
    },
  ],
  physicalConstraints: [
    "conceptKey must belong to the declared topicArea in the deterministic NCUK conceptual rule table",
    "All returned classifications and rubric anchors are verified non-numeric strings",
  ],
  probeSpecs: [
    {
      kind: "conceptual-classification",
      topicArea: "ac4-electricity-capacitance",
      conceptKey: "volt-unit-equivalence",
      variantIndex: 0,
      promptMode: "mcq",
    },
    {
      kind: "conceptual-classification",
      topicArea: "ac3-thermal-matter",
      conceptKey: "causal-kinetic-gas-pressure",
      variantIndex: 1,
      promptMode: "explain",
    },
    {
      kind: "conceptual-classification",
      topicArea: "ac2-mechanics-materials",
      conceptKey: "def-moment",
      variantIndex: 2,
      promptMode: "define",
    },
    {
      kind: "conceptual-classification",
      topicArea: "ac1-units-uncertainty",
      conceptKey: "causal-random-vs-systematic-error",
      variantIndex: 3,
      promptMode: "state-and-explain",
    },
  ],
  validate: validateConceptualSpec,
  solve: solveConceptualSpec,
};

// ============================================================================
// PLUGIN 2: false-origin-gradient-experiment (graphs)
// ============================================================================

export const FALSE_ORIGIN_EXPERIMENT_TYPES = [
  "loaded-spring-false-origin",
  "pressure-temp-false-origin",
  "wire-extension-power-uncertainty",
] as const;

export type FalseOriginExperimentType =
  (typeof FALSE_ORIGIN_EXPERIMENT_TYPES)[number];

interface FalseOriginSpec {
  readonly kind: "false-origin-gradient-experiment";
  readonly experimentType: FalseOriginExperimentType;
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly trueGradient: number;
  readonly trueIntercept: number;
  readonly errY: number;
  readonly xRead1: number;
  readonly xRead2: number;
  readonly diameterMm: number;
  readonly diameterUncMm: number;
  readonly sumReadingUncMm: number;
}

interface PlottedPoint {
  readonly x: number;
  readonly y: number;
}

function buildFalseOriginPoints(spec: FalseOriginSpec): PlottedPoint[] {
  const spanX = spec.xMax - spec.xMin;
  const xFirst = spec.xMin + 0.1 * spanX;
  const xLast = spec.xMax - 0.1 * spanX;
  const offsets = [0.22, -0.28, 0.18, -0.24, 0.26, -0.18];
  const pts: PlottedPoint[] = [];
  for (let i = 0; i < 6; i += 1) {
    const x = xFirst + (i / 5) * (xLast - xFirst);
    const y = spec.trueGradient * x + spec.trueIntercept + offsets[i] * spec.errY;
    pts.push({ x, y });
  }
  return pts;
}

function validateFalseOriginSpec(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "false-origin-gradient-experiment") {
    issues.push('kind must equal "false-origin-gradient-experiment"');
  }
  if (
    typeof spec.experimentType !== "string" ||
    !(FALSE_ORIGIN_EXPERIMENT_TYPES as readonly string[]).includes(
      spec.experimentType,
    )
  ) {
    issues.push(
      `experimentType must be one of: ${FALSE_ORIGIN_EXPERIMENT_TYPES.join(", ")}`,
    );
  }

  const numericFields = [
    "xMin",
    "xMax",
    "yMin",
    "yMax",
    "trueGradient",
    "trueIntercept",
    "errY",
    "xRead1",
    "xRead2",
    "diameterMm",
    "diameterUncMm",
    "sumReadingUncMm",
  ] as const;

  for (const field of numericFields) {
    if (!isFiniteNumber(spec[field])) {
      issues.push(`${field} must be a finite number`);
    }
  }
  if (issues.length > 0) {
    return { valid: false, issues };
  }

  const s = spec as unknown as FalseOriginSpec;
  if (s.xMax <= s.xMin) issues.push("xMax must exceed xMin");
  if (s.yMax <= s.yMin) issues.push("yMax must exceed yMin");
  if (s.yMin <= 0) {
    issues.push("yMin must be positive to represent a suppressed false origin");
  }
  if (s.trueGradient <= 0) issues.push("trueGradient must be strictly positive");
  if (s.errY <= 0) issues.push("errY must be strictly positive");
  if (s.errY >= 0.15 * (s.yMax - s.yMin)) {
    issues.push("errY must be smaller than 15% of the plotted y-axis span");
  }
  if (s.xRead1 < s.xMin || s.xRead2 > s.xMax || s.xRead2 <= s.xRead1) {
    issues.push("xRead1 and xRead2 must lie strictly ordered inside [xMin, xMax]");
  }
  if (s.xRead2 - s.xRead1 < 0.52 * (s.xMax - s.xMin)) {
    issues.push(
      "Large gradient triangle must span more than 50% of the plotted horizontal range",
    );
  }
  if (s.diameterMm <= 0 || s.diameterUncMm <= 0 || s.diameterUncMm >= 0.2 * s.diameterMm) {
    issues.push("diameterMm and diameterUncMm must be positive with small relative error");
  }
  if (s.sumReadingUncMm <= 0) {
    issues.push("sumReadingUncMm must be strictly positive");
  }

  const pts = buildFalseOriginPoints(s);
  for (const p of pts) {
    if (p.y - s.errY < s.yMin || p.y + s.errY > s.yMax) {
      issues.push(
        `Plotted point (${p.x.toFixed(2)}, ${p.y.toFixed(3)}) with error bar ±${s.errY} exits [yMin, yMax]`,
      );
      break;
    }
  }

  return { valid: issues.length === 0, issues };
}

function solveFalseOriginSpec(spec: Record<string, unknown>): DomainSolveOutput {
  const check = validateFalseOriginSpec(spec);
  if (!check.valid) {
    throw new Error(check.issues.join("; "));
  }
  const s = spec as unknown as FalseOriginSpec;
  const pts = buildFalseOriginPoints(s);
  const yRead1 = s.trueGradient * s.xRead1 + s.trueIntercept;
  const yRead2 = s.trueGradient * s.xRead2 + s.trueIntercept;
  const bestGradient = (yRead2 - yRead1) / (s.xRead2 - s.xRead1);

  const first = pts[0];
  const last = pts[pts.length - 1];
  const spanX = last.x - first.x;
  const worstGradientSteep =
    (last.y + s.errY - (first.y - s.errY)) / spanX;
  const worstGradientShallow =
    (last.y - s.errY - (first.y + s.errY)) / spanX;
  const diffSteep = Math.abs(worstGradientSteep - bestGradient);
  const diffShallow = Math.abs(worstGradientShallow - bestGradient);
  const worstGradient =
    diffSteep >= diffShallow ? worstGradientSteep : worstGradientShallow;
  const gradientUncertainty = Math.max(diffSteep, diffShallow);
  const percentUncertaintyGradient =
    (gradientUncertainty / Math.abs(bestGradient)) * 100;

  const inverseGradient = 1 / bestGradient;
  const inverseGradientUncertainty =
    inverseGradient * (gradientUncertainty / Math.abs(bestGradient));

  const sumAbsUncertaintyMm = 2 * s.sumReadingUncMm;
  const percentUncertaintyDiameter = (s.diameterUncMm / s.diameterMm) * 100;
  const percentUncertaintyArea = 2 * percentUncertaintyDiameter;
  const combinedPercentUncertainty =
    percentUncertaintyGradient + percentUncertaintyArea;

  const quantities: VerifiedQuantityMap = {
    experimentType: s.experimentType,
    yRead1,
    yRead2,
    bestGradient,
    worstGradient,
    worstGradientSteep,
    worstGradientShallow,
    gradientUncertainty,
    percentUncertaintyGradient,
    inverseGradient,
    inverseGradientUncertainty,
    extrapolatedIntercept: s.trueIntercept,
    sumAbsUncertaintyMm,
    percentUncertaintyDiameter,
    percentUncertaintyArea,
    combinedPercentUncertainty,
    falseOriginPurpose:
      "expands the plotted data to fill more than half of the grid improving reading precision",
    largeTrianglePurpose:
      "reduces percentage reading uncertainty when calculating the gradient",
    worstFitRule:
      "steepest or shallowest straight line that still passes through all error bars",
  };

  return {
    solverId: "sixthphysics/ncuk-false-origin-gradient/1.0.0",
    quantities,
  };
}

function renderFalseOriginSvg(
  spec: Record<string, unknown>,
): DomainRenderOutput {
  const check = validateFalseOriginSpec(spec);
  if (!check.valid) {
    throw new Error(check.issues.join("; "));
  }
  const s = spec as unknown as FalseOriginSpec;
  const pts = buildFalseOriginPoints(s);

  const width = 720;
  const height = 460;
  const left = 96;
  const right = 672;
  const top = 38;
  const bottom = 386;
  const plotW = right - left;
  const plotH = bottom - top;

  const mapX = (x: number): number =>
    left + ((x - s.xMin) / (s.xMax - s.xMin)) * plotW;
  const mapY = (y: number): number =>
    bottom - ((y - s.yMin) / (s.yMax - s.yMin)) * plotH;

  const axisMeta: Readonly<
    Record<
      FalseOriginExperimentType,
      { xTitle: string; yTitle: string; desc: string }
    >
  > = {
    "loaded-spring-false-origin": {
      xTitle: "Load F / N",
      yTitle: "Length L / m",
      desc: "Suppressed-origin graph of spring length against load with cross data points, error bars, and best-fit line",
    },
    "pressure-temp-false-origin": {
      xTitle: "Temperature θ / °C",
      yTitle: "Pressure p / kPa",
      desc: "Suppressed-origin graph of gas pressure against Celsius temperature with cross data points, error bars, and best-fit line",
    },
    "wire-extension-power-uncertainty": {
      xTitle: "Tension F / N",
      yTitle: "Gauge length L / mm",
      desc: "Suppressed-origin graph of wire length against tension with cross data points, error bars, and best-fit line",
    },
  };

  const meta = axisMeta[s.experimentType];
  const publicNumbers: number[] = [];
  const publicLabels: string[] = [meta.xTitle, meta.yTitle, "False origin"];

  const xTicks = Array.from(
    { length: 6 },
    (_, idx) => s.xMin + ((s.xMax - s.xMin) * idx) / 5,
  );
  const yTicks = Array.from(
    { length: 6 },
    (_, idx) => s.yMin + ((s.yMax - s.yMin) * idx) / 5,
  );

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(meta.desc)}">`,
  );
  parts.push(`<title>${escapeXml(meta.desc)}</title>`);
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);

  // Minor gridlines (20 subdivisions)
  for (let i = 0; i <= 20; i += 1) {
    const gx = left + (plotW * i) / 20;
    const gy = top + (plotH * i) / 20;
    const isMajor = i % 4 === 0;
    const stroke = isMajor ? "#cbd5e1" : "#f1f5f9";
    const sw = isMajor ? "1.1" : "0.7";
    parts.push(
      `<line x1="${coord(gx)}" y1="${coord(top)}" x2="${coord(gx)}" y2="${coord(bottom)}" stroke="${stroke}" stroke-width="${sw}"/>`,
    );
    parts.push(
      `<line x1="${coord(left)}" y1="${coord(gy)}" x2="${coord(right)}" y2="${coord(gy)}" stroke="${stroke}" stroke-width="${sw}"/>`,
    );
  }

  // Outer plot border + crisp axes
  parts.push(
    `<rect x="${coord(left)}" y="${coord(top)}" width="${coord(plotW)}" height="${coord(plotH)}" fill="none" stroke="#94a3b8" stroke-width="1"/>`,
  );
  parts.push(
    `<line x1="${coord(left)}" y1="${coord(bottom)}" x2="${coord(right)}" y2="${coord(bottom)}" stroke="#0f172a" stroke-width="2"/>`,
  );
  parts.push(
    `<line x1="${coord(left)}" y1="${coord(top)}" x2="${coord(left)}" y2="${coord(bottom)}" stroke="#0f172a" stroke-width="2"/>`,
  );

  // Explicit suppressed/false origin break zigzag on y-axis (and x-axis when xMin > 0)
  const yBreakBase = bottom - 8;
  parts.push(
    `<path d="M ${coord(left - 6)} ${coord(yBreakBase)} L ${coord(left + 6)} ${coord(yBreakBase - 6)} L ${coord(left - 6)} ${coord(yBreakBase - 12)} L ${coord(left + 6)} ${coord(yBreakBase - 18)}" fill="none" stroke="#b91c1c" stroke-width="1.8"/>`,
  );
  if (s.xMin > 0) {
    const xBreakBase = left + 8;
    parts.push(
      `<path d="M ${coord(xBreakBase)} ${coord(bottom + 6)} L ${coord(xBreakBase + 6)} ${coord(bottom - 6)} L ${coord(xBreakBase + 12)} ${coord(bottom + 6)} L ${coord(xBreakBase + 18)} ${coord(bottom - 6)}" fill="none" stroke="#b91c1c" stroke-width="1.8"/>`,
    );
  }

  // X ticks & labels
  for (const xv of xTicks) {
    const px = mapX(xv);
    const lbl = formatTickNum(xv);
    publicNumbers.push(xv);
    publicLabels.push(lbl);
    parts.push(
      `<line x1="${coord(px)}" y1="${coord(bottom)}" x2="${coord(px)}" y2="${coord(bottom + 6)}" stroke="#0f172a" stroke-width="1.5"/>`,
    );
    parts.push(
      `<text x="${coord(px)}" y="${coord(bottom + 22)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#0f172a">${escapeXml(lbl)}</text>`,
    );
  }

  // Y ticks & labels
  for (const yv of yTicks) {
    const py = mapY(yv);
    const lbl = formatTickNum(yv);
    publicNumbers.push(yv);
    publicLabels.push(lbl);
    parts.push(
      `<line x1="${coord(left - 6)}" y1="${coord(py)}" x2="${coord(left)}" y2="${coord(py)}" stroke="#0f172a" stroke-width="1.5"/>`,
    );
    parts.push(
      `<text x="${coord(left - 12)}" y="${coord(py + 4)}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" fill="#0f172a">${escapeXml(lbl)}</text>`,
    );
  }

  // Axis titles
  parts.push(
    `<text x="${coord((left + right) / 2)}" y="${coord(bottom + 48)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">${escapeXml(meta.xTitle)}</text>`,
  );
  parts.push(
    `<text x="26" y="${coord((top + bottom) / 2)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a" transform="rotate(-90 26 ${coord((top + bottom) / 2)})">${escapeXml(meta.yTitle)}</text>`,
  );

  // Best-fit line clipped cleanly inside plot domain
  const xLineStart = Math.max(s.xMin, s.xMin + 0.04 * (s.xMax - s.xMin));
  const xLineEnd = Math.min(s.xMax, s.xMax - 0.04 * (s.xMax - s.xMin));
  const yLineStart = s.trueGradient * xLineStart + s.trueIntercept;
  const yLineEnd = s.trueGradient * xLineEnd + s.trueIntercept;
  parts.push(
    `<line x1="${coord(mapX(xLineStart))}" y1="${coord(mapY(yLineStart))}" x2="${coord(mapX(xLineEnd))}" y2="${coord(mapY(yLineEnd))}" stroke="#1d4ed8" stroke-width="2.2"/>`,
  );

  // Large gradient triangle reference guide (dashed, NO numeric answer printed!)
  const rx1 = mapX(s.xRead1);
  const ry1 = mapY(s.trueGradient * s.xRead1 + s.trueIntercept);
  const rx2 = mapX(s.xRead2);
  const ry2 = mapY(s.trueGradient * s.xRead2 + s.trueIntercept);
  parts.push(
    `<line x1="${coord(rx1)}" y1="${coord(ry1)}" x2="${coord(rx2)}" y2="${coord(ry1)}" stroke="#047857" stroke-width="1.4" stroke-dasharray="6 4"/>`,
  );
  parts.push(
    `<line x1="${coord(rx2)}" y1="${coord(ry1)}" x2="${coord(rx2)}" y2="${coord(ry2)}" stroke="#047857" stroke-width="1.4" stroke-dasharray="6 4"/>`,
  );
  parts.push(
    `<circle cx="${coord(rx1)}" cy="${coord(ry1)}" r="4" fill="#ffffff" stroke="#047857" stroke-width="1.8"/>`,
  );
  parts.push(
    `<circle cx="${coord(rx2)}" cy="${coord(ry2)}" r="4" fill="#ffffff" stroke="#047857" stroke-width="1.8"/>`,
  );
  parts.push(
    `<text x="${coord((rx1 + rx2) / 2)}" y="${coord(ry1 + 16)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11.5" fill="#047857">Δx</text>`,
  );
  parts.push(
    `<text x="${coord(rx2 + 12)}" y="${coord((ry1 + ry2) / 2 + 4)}" text-anchor="start" font-family="Arial, sans-serif" font-size="11.5" fill="#047857">Δy</text>`,
  );
  publicLabels.push("Δx", "Δy");

  // Plotted × markers and vertical error bars
  for (const pt of pts) {
    const px = mapX(pt.x);
    const py = mapY(pt.y);
    const pyTop = mapY(pt.y + s.errY);
    const pyBot = mapY(pt.y - s.errY);
    parts.push(
      `<line x1="${coord(px)}" y1="${coord(pyTop)}" x2="${coord(px)}" y2="${coord(pyBot)}" stroke="#334155" stroke-width="1.3"/>`,
    );
    parts.push(
      `<line x1="${coord(px - 4.5)}" y1="${coord(pyTop)}" x2="${coord(px + 4.5)}" y2="${coord(pyTop)}" stroke="#334155" stroke-width="1.3"/>`,
    );
    parts.push(
      `<line x1="${coord(px - 4.5)}" y1="${coord(pyBot)}" x2="${coord(px + 4.5)}" y2="${coord(pyBot)}" stroke="#334155" stroke-width="1.3"/>`,
    );
    parts.push(
      `<line x1="${coord(px - 4.5)}" y1="${coord(py - 4.5)}" x2="${coord(px + 4.5)}" y2="${coord(py + 4.5)}" stroke="#b91c1c" stroke-width="1.9"/>`,
    );
    parts.push(
      `<line x1="${coord(px - 4.5)}" y1="${coord(py + 4.5)}" x2="${coord(px + 4.5)}" y2="${coord(py - 4.5)}" stroke="#b91c1c" stroke-width="1.9"/>`,
    );
  }

  // Subtle corner legend (no numeric leakage)
  parts.push(
    `<rect x="${coord(left + 14)}" y="${coord(top + 12)}" width="166" height="44" rx="5" fill="#ffffff" fill-opacity="0.94" stroke="#cbd5e1" stroke-width="1"/>`,
  );
  parts.push(
    `<line x1="${coord(left + 24)}" y1="${coord(top + 26)}" x2="${coord(left + 44)}" y2="${coord(top + 26)}" stroke="#1d4ed8" stroke-width="2.2"/>`,
  );
  parts.push(
    `<text x="${coord(left + 52)}" y="${coord(top + 30)}" font-family="Arial, sans-serif" font-size="11.5" fill="#0f172a">Best-fit line</text>`,
  );
  parts.push(
    `<line x1="${coord(left + 30)}" y1="${coord(top + 40)}" x2="${coord(left + 38)}" y2="${coord(top + 48)}" stroke="#b91c1c" stroke-width="1.8"/>`,
  );
  parts.push(
    `<line x1="${coord(left + 30)}" y1="${coord(top + 48)}" x2="${coord(left + 38)}" y2="${coord(top + 40)}" stroke="#b91c1c" stroke-width="1.8"/>`,
  );
  parts.push(
    `<text x="${coord(left + 52)}" y="${coord(top + 48)}" font-family="Arial, sans-serif" font-size="11.5" fill="#0f172a">Data with error bars</text>`,
  );
  publicLabels.push("Best-fit line", "Data with error bars");

  parts.push("</svg>");

  return {
    visualFamily: "graphs",
    svgMarkup: parts.join(""),
    rendererVersion: "sixthphysics/ncuk-false-origin-svg/1.0.0",
    publicNumbers,
    publicLabels,
  };
}

const FALSE_ORIGIN_GRADIENT_PLUGIN: DomainKindPlugin = {
  domain: "graphs",
  kind: "false-origin-gradient-experiment",
  summary:
    "NCUK AC1.2 suppressed/false-origin linear graph with plotted cross markers, vertical error bars, large gradient triangle (>50% range), worst-fit line gradient uncertainty, and power/sum uncertainty propagation.",
  requiredFields: [
    {
      name: "experimentType",
      type: "string",
      enumValues: FALSE_ORIGIN_EXPERIMENT_TYPES,
    },
    { name: "xMin", type: "number", bounds: ">= 0" },
    { name: "xMax", type: "number", bounds: "> xMin" },
    { name: "yMin", type: "number", bounds: "> 0 (false origin)" },
    { name: "yMax", type: "number", bounds: "> yMin" },
    { name: "trueGradient", type: "number", bounds: "> 0" },
    { name: "trueIntercept", type: "number" },
    { name: "errY", type: "number", bounds: "> 0" },
    { name: "xRead1", type: "number", bounds: "inside [xMin, xMax]" },
    { name: "xRead2", type: "number", bounds: "xRead2 - xRead1 > 0.52 * (xMax - xMin)" },
    { name: "diameterMm", type: "number", unit: "mm", bounds: "> 0" },
    { name: "diameterUncMm", type: "number", unit: "mm", bounds: "> 0" },
    { name: "sumReadingUncMm", type: "number", unit: "mm", bounds: "> 0" },
  ],
  physicalConstraints: [
    "yMin > 0 enforces a suppressed/false vertical origin",
    "Large gradient triangle spans more than 50% of the plotted horizontal range",
    "All 6 data points and their vertical error bars stay within the plotted domain",
  ],
  probeSpecs: [
    {
      kind: "false-origin-gradient-experiment",
      experimentType: "loaded-spring-false-origin",
      xMin: 2.0,
      xMax: 12.0,
      yMin: 0.2,
      yMax: 0.45,
      trueGradient: 0.018,
      trueIntercept: 0.204,
      errY: 0.008,
      xRead1: 3.0,
      xRead2: 11.0,
      diameterMm: 0.64,
      diameterUncMm: 0.02,
      sumReadingUncMm: 0.5,
    },
    {
      kind: "false-origin-gradient-experiment",
      experimentType: "pressure-temp-false-origin",
      xMin: 10.0,
      xMax: 90.0,
      yMin: 95.0,
      yMax: 135.0,
      trueGradient: 0.36,
      trueIntercept: 98.4,
      errY: 1.5,
      xRead1: 20.0,
      xRead2: 80.0,
      diameterMm: 1.2,
      diameterUncMm: 0.03,
      sumReadingUncMm: 1.0,
    },
  ],
  validate: validateFalseOriginSpec,
  solve: solveFalseOriginSpec,
  renderSvg: renderFalseOriginSvg,
};

// ============================================================================
// PLUGIN 3: thermal-phase-cooling-gas-10m (thermal)
// ============================================================================

export const THERMAL_CURVE_MODES = [
  "heating-plateau",
  "cooling-plateau",
] as const;

export type ThermalCurveMode = (typeof THERMAL_CURVE_MODES)[number];

interface Thermal10mSpec {
  readonly kind: "thermal-phase-cooling-gas-10m";
  readonly curveMode: ThermalCurveMode;
  readonly massKg: number;
  readonly specificHeatSolidJKgK: number;
  readonly latentHeatFusionJKg: number;
  readonly thetaStartC: number;
  readonly thetaMeltC: number;
  readonly heaterPowerW: number;
  readonly thermalEfficiency: number;
  readonly gasInitialPressureKPa: number;
  readonly gasInitialTempC: number;
  readonly gasFinalTempC: number;
}

function validateThermal10mSpec(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "thermal-phase-cooling-gas-10m") {
    issues.push('kind must equal "thermal-phase-cooling-gas-10m"');
  }
  if (
    typeof spec.curveMode !== "string" ||
    !(THERMAL_CURVE_MODES as readonly string[]).includes(spec.curveMode)
  ) {
    issues.push(`curveMode must be one of: ${THERMAL_CURVE_MODES.join(", ")}`);
  }

  const numFields = [
    "massKg",
    "specificHeatSolidJKgK",
    "latentHeatFusionJKg",
    "thetaStartC",
    "thetaMeltC",
    "heaterPowerW",
    "thermalEfficiency",
    "gasInitialPressureKPa",
    "gasInitialTempC",
    "gasFinalTempC",
  ] as const;
  for (const f of numFields) {
    if (!isFiniteNumber(spec[f])) {
      issues.push(`${f} must be a finite number`);
    }
  }
  if (issues.length > 0) return { valid: false, issues };

  const s = spec as unknown as Thermal10mSpec;
  if (s.massKg < 0.05 || s.massKg > 3.0) {
    issues.push("massKg must be in [0.05, 3.0] kg");
  }
  if (s.specificHeatSolidJKgK < 300 || s.specificHeatSolidJKgK > 4500) {
    issues.push("specificHeatSolidJKgK must be in [300, 4500] J kg⁻¹ K⁻¹");
  }
  if (s.latentHeatFusionJKg < 20_000 || s.latentHeatFusionJKg > 500_000) {
    issues.push("latentHeatFusionJKg must be in [2e4, 5e5] J kg⁻¹");
  }
  if (s.thetaMeltC <= s.thetaStartC + 15) {
    issues.push("thetaMeltC must exceed thetaStartC by at least 15 °C");
  }
  if (s.heaterPowerW < 15 || s.heaterPowerW > 1000) {
    issues.push("heaterPowerW must be in [15, 1000] W");
  }
  if (s.thermalEfficiency <= 0.4 || s.thermalEfficiency > 1.0) {
    issues.push("thermalEfficiency must be in (0.4, 1.0]");
  }
  if (s.gasInitialPressureKPa < 50 || s.gasInitialPressureKPa > 300) {
    issues.push("gasInitialPressureKPa must be in [50, 300] kPa");
  }
  if (s.gasFinalTempC <= s.gasInitialTempC + 20) {
    issues.push("gasFinalTempC must exceed gasInitialTempC by at least 20 °C");
  }

  return { valid: issues.length === 0, issues };
}

function solveThermal10mSpec(spec: Record<string, unknown>): DomainSolveOutput {
  const check = validateThermal10mSpec(spec);
  if (!check.valid) {
    throw new Error(check.issues.join("; "));
  }
  const s = spec as unknown as Thermal10mSpec;
  const deltaTempSolidK = s.thetaMeltC - s.thetaStartC;
  const warmingEnergyJ = s.massKg * s.specificHeatSolidJKgK * deltaTempSolidK;
  const warmingEnergyKJ = warmingEnergyJ / 1000;
  const meltingEnergyJ = s.massKg * s.latentHeatFusionJKg;
  const meltingEnergyKJ = meltingEnergyJ / 1000;
  const totalThermalEnergyJ = warmingEnergyJ + meltingEnergyJ;
  const totalThermalEnergyKJ = totalThermalEnergyJ / 1000;
  const idealHeatingTimeS = totalThermalEnergyJ / s.heaterPowerW;
  const actualHeatingTimeS =
    totalThermalEnergyJ / (s.thermalEfficiency * s.heaterPowerW);
  const actualHeatingTimeMin = actualHeatingTimeS / 60;

  const gasInitialTempK = s.gasInitialTempC + NCUK_KELVIN_OFFSET;
  const gasFinalTempK = s.gasFinalTempC + NCUK_KELVIN_OFFSET;
  const finalGasPressureKPa =
    s.gasInitialPressureKPa * (gasFinalTempK / gasInitialTempK);
  const finalGasPressurePa = finalGasPressureKPa * 1000;

  const quantities: VerifiedQuantityMap = {
    curveMode: s.curveMode,
    deltaTempSolidK,
    warmingEnergyJ,
    warmingEnergyKJ,
    meltingEnergyJ,
    meltingEnergyKJ,
    totalThermalEnergyJ,
    totalThermalEnergyKJ,
    idealHeatingTimeS,
    actualHeatingTimeS,
    actualHeatingTimeMin,
    gasInitialTempK,
    gasFinalTempK,
    finalGasPressureKPa,
    finalGasPressurePa,
    plateauEnergyExplanation:
      "mean molecular kinetic energy stays constant while intermolecular potential energy changes to overcome or form intermolecular bonds",
    thermalLossReason:
      "thermal energy is transferred to the surroundings and absorbed by the container",
    coolingCurveFeature:
      "temperature remains constant along a horizontal plateau during freezing before falling smoothly toward ambient temperature",
    pressureLawStatement:
      "for a fixed mass of ideal gas at constant volume pressure is directly proportional to absolute temperature in kelvin",
    gasPressureMechanism:
      "faster molecules undergo a greater momentum change per wall collision and collide more frequently raising average force per unit area",
  };

  return {
    solverId: "sixthphysics/ncuk-thermal-phase-gas-10m/1.0.0",
    quantities,
  };
}

function renderThermal10mSvg(
  spec: Record<string, unknown>,
): DomainRenderOutput {
  const check = validateThermal10mSpec(spec);
  if (!check.valid) {
    throw new Error(check.issues.join("; "));
  }
  const s = spec as unknown as Thermal10mSpec;

  const width = 720;
  const height = 460;
  const left = 96;
  const right = 670;
  const top = 42;
  const bottom = 384;
  const plotW = right - left;
  const plotH = bottom - top;

  const yAxisMin = 0;
  const thetaLiquidTop = Math.ceil((s.thetaMeltC + 24) / 10) * 10;
  const yAxisMax = Math.max(thetaLiquidTop + 10, 100);
  const mapY = (theta: number): number =>
    bottom - ((theta - yAxisMin) / (yAxisMax - yAxisMin)) * plotH;

  const isHeating = s.curveMode === "heating-plateau";
  const desc = isHeating
    ? "Temperature against time heating curve showing solid warming, horizontal melting plateau, and liquid warming"
    : "Temperature against time cooling curve showing liquid cooling, horizontal freezing plateau, and solid cooling";

  const publicNumbers: number[] = [0, s.thetaStartC, s.thetaMeltC];
  const publicLabels: string[] = [
    "Temperature θ / °C",
    "Time t",
    "Solid",
    "Liquid",
    isHeating ? "Melting plateau" : "Freezing plateau",
    "P",
    "Q",
    "R",
    "S",
  ];

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(desc)}">`,
  );
  parts.push(`<title>${escapeXml(desc)}</title>`);
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);

  // Horizontal light reference gridlines at clean multiples (skip values close to thetaStartC/thetaMeltC to avoid label clash)
  const yStep = yAxisMax > 130 ? 30 : 20;
  for (let tv = 0; tv <= yAxisMax; tv += yStep) {
    const py = mapY(tv);
    parts.push(
      `<line x1="${coord(left)}" y1="${coord(py)}" x2="${coord(right)}" y2="${coord(py)}" stroke="#f1f5f9" stroke-width="1"/>`,
    );
    const closeToKey =
      Math.abs(tv - s.thetaStartC) < 7 || Math.abs(tv - s.thetaMeltC) < 7;
    if (!closeToKey) {
      const lbl = formatTickNum(tv);
      publicNumbers.push(tv);
      publicLabels.push(lbl);
      parts.push(
        `<line x1="${coord(left - 5)}" y1="${coord(py)}" x2="${coord(left)}" y2="${coord(py)}" stroke="#64748b" stroke-width="1.2"/>`,
      );
      parts.push(
        `<text x="${coord(left - 11)}" y="${coord(py + 4)}" text-anchor="end" font-family="Arial, sans-serif" font-size="11.5" fill="#475569">${escapeXml(lbl)}</text>`,
      );
    }
  }

  // Axes with arrows
  parts.push(
    `<line x1="${coord(left)}" y1="${coord(bottom)}" x2="${coord(right)}" y2="${coord(bottom)}" stroke="#0f172a" stroke-width="2"/>`,
  );
  parts.push(
    `<line x1="${coord(left)}" y1="${coord(top)}" x2="${coord(left)}" y2="${coord(bottom)}" stroke="#0f172a" stroke-width="2"/>`,
  );
  parts.push(
    `<polygon points="${coord(right)},${coord(bottom)} ${coord(right - 10)},${coord(bottom - 5)} ${coord(right - 10)},${coord(bottom + 5)}" fill="#0f172a"/>`,
  );
  parts.push(
    `<polygon points="${coord(left)},${coord(top)} ${coord(left - 5)},${coord(top + 10)} ${coord(left + 5)},${coord(top + 10)}" fill="#0f172a"/>`,
  );

  // Axis titles
  parts.push(
    `<text x="${coord((left + right) / 2)}" y="${coord(bottom + 46)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">Time t</text>`,
  );
  parts.push(
    `<text x="26" y="${coord((top + bottom) / 2)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a" transform="rotate(-90 26 ${coord((top + bottom) / 2)})">Temperature θ / °C</text>`,
  );

  // Key horizontal dashed guides for thetaStartC and thetaMeltC
  const yStart = mapY(s.thetaStartC);
  const yMelt = mapY(s.thetaMeltC);
  const yLiq = mapY(Math.min(yAxisMax - 10, s.thetaMeltC + 22));

  const x0 = left;
  const x1 = left + 0.28 * plotW;
  const x2 = left + 0.68 * plotW;
  const x3 = left + 0.92 * plotW;

  const meltLbl = formatTickNum(s.thetaMeltC);
  const startLbl = formatTickNum(s.thetaStartC);
  publicLabels.push(meltLbl, startLbl);

  parts.push(
    `<line x1="${coord(left)}" y1="${coord(yMelt)}" x2="${coord(x2)}" y2="${coord(yMelt)}" stroke="#0284c7" stroke-width="1.3" stroke-dasharray="6 4"/>`,
  );
  parts.push(
    `<line x1="${coord(left - 6)}" y1="${coord(yMelt)}" x2="${coord(left)}" y2="${coord(yMelt)}" stroke="#0284c7" stroke-width="2"/>`,
  );
  parts.push(
    `<text x="${coord(left - 11)}" y="${coord(yMelt + 4)}" text-anchor="end" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#0369a1">${escapeXml(meltLbl)}</text>`,
  );

  parts.push(
    `<line x1="${coord(left)}" y1="${coord(yStart)}" x2="${coord(isHeating ? x0 + 36 : x3)}" y2="${coord(yStart)}" stroke="#64748b" stroke-width="1.2" stroke-dasharray="5 4"/>`,
  );
  parts.push(
    `<line x1="${coord(left - 6)}" y1="${coord(yStart)}" x2="${coord(left)}" y2="${coord(yStart)}" stroke="#0f172a" stroke-width="1.8"/>`,
  );
  parts.push(
    `<text x="${coord(left - 11)}" y="${coord(yStart + 4)}" text-anchor="end" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#0f172a">${escapeXml(startLbl)}</text>`,
  );

  // Subtle vertical stage drop guides at x1 and x2 (schematic letters only — ZERO leaked heating time!)
  parts.push(
    `<line x1="${coord(x1)}" y1="${coord(yMelt)}" x2="${coord(x1)}" y2="${coord(bottom)}" stroke="#94a3b8" stroke-width="1.1" stroke-dasharray="4 4"/>`,
  );
  parts.push(
    `<line x1="${coord(x2)}" y1="${coord(yMelt)}" x2="${coord(x2)}" y2="${coord(bottom)}" stroke="#94a3b8" stroke-width="1.1" stroke-dasharray="4 4"/>`,
  );

  if (isHeating) {
    const pathD = `M ${coord(x0)} ${coord(yStart)} L ${coord(x1)} ${coord(yMelt)} L ${coord(x2)} ${coord(yMelt)} L ${coord(x3)} ${coord(yLiq)}`;
    parts.push(
      `<path d="${pathD}" fill="none" stroke="#1d4ed8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    // Stage vertices P, Q, R, S
    for (const [px, py, lbl, dx, dy] of [
      [x0 + 2, yStart, "P", 12, -10],
      [x1, yMelt, "Q", -8, -14],
      [x2, yMelt, "R", 6, -14],
      [x3, yLiq, "S", 10, 4],
    ] as const) {
      parts.push(
        `<circle cx="${coord(px)}" cy="${coord(py)}" r="4" fill="#1d4ed8"/>`,
      );
      parts.push(
        `<text x="${coord(px + dx)}" y="${coord(py + dy)}" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">${lbl}</text>`,
      );
    }
    // Phase labels positioned with zero overlap
    parts.push(
      `<text x="${coord((x0 + x1) / 2 + 16)}" y="${coord((yStart + yMelt) / 2 + 18)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" fill="#334155">Solid</text>`,
    );
    parts.push(
      `<text x="${coord((x1 + x2) / 2)}" y="${coord(yMelt - 16)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#0369a1">Melting plateau</text>`,
    );
    parts.push(
      `<text x="${coord((x2 + x3) / 2 + 4)}" y="${coord((yMelt + yLiq) / 2 + 22)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" fill="#334155">Liquid</text>`,
    );
  } else {
    const pathD = `M ${coord(x0)} ${coord(yLiq)} L ${coord(x1)} ${coord(yMelt)} L ${coord(x2)} ${coord(yMelt)} Q ${coord((x2 + x3) / 2)} ${coord((yMelt + yStart) / 2 + 12)} ${coord(x3)} ${coord(yStart)}`;
    parts.push(
      `<path d="${pathD}" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    for (const [px, py, lbl, dx, dy] of [
      [x0 + 2, yLiq, "P", 12, -10],
      [x1, yMelt, "Q", -8, -14],
      [x2, yMelt, "R", 8, -14],
      [x3, yStart, "S", 10, -8],
    ] as const) {
      parts.push(
        `<circle cx="${coord(px)}" cy="${coord(py)}" r="4" fill="#0f766e"/>`,
      );
      parts.push(
        `<text x="${coord(px + dx)}" y="${coord(py + dy)}" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">${lbl}</text>`,
      );
    }
    parts.push(
      `<text x="${coord((x0 + x1) / 2 + 14)}" y="${coord((yLiq + yMelt) / 2 - 12)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" fill="#334155">Liquid</text>`,
    );
    parts.push(
      `<text x="${coord((x1 + x2) / 2)}" y="${coord(yMelt - 16)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#0f766e">Freezing plateau</text>`,
    );
    parts.push(
      `<text x="${coord((x2 + x3) / 2 + 14)}" y="${coord((yMelt + yStart) / 2 - 10)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" fill="#334155">Solid</text>`,
    );
  }

  parts.push("</svg>");

  return {
    visualFamily: "thermal",
    svgMarkup: parts.join(""),
    rendererVersion: "sixthphysics/ncuk-thermal-phase-gas-10m-svg/1.0.0",
    publicNumbers,
    publicLabels,
  };
}

const THERMAL_PHASE_COOLING_GAS_10M_PLUGIN: DomainKindPlugin = {
  domain: "thermal",
  kind: "thermal-phase-cooling-gas-10m",
  summary:
    "10-mark NCUK IFYPH005 AC3 flagship structured problem combining solid SHC + latent heat of fusion + heater efficiency, molecular plateau internal-energy explanation, and Pressure Law (T/K = θ/°C + 273.2) with Newton second law kinetic theory.",
  requiredFields: [
    { name: "curveMode", type: "string", enumValues: THERMAL_CURVE_MODES },
    { name: "massKg", type: "number", unit: "kg", bounds: "0.05..3.0" },
    { name: "specificHeatSolidJKgK", type: "number", unit: "J kg^-1 K^-1", bounds: "300..4500" },
    { name: "latentHeatFusionJKg", type: "number", unit: "J kg^-1", bounds: "2e4..5e5" },
    { name: "thetaStartC", type: "number", unit: "°C", bounds: "10..35" },
    { name: "thetaMeltC", type: "number", unit: "°C", bounds: "> thetaStartC + 15" },
    { name: "heaterPowerW", type: "number", unit: "W", bounds: "15..1000" },
    { name: "thermalEfficiency", type: "number", bounds: "(0.4, 1.0]" },
    { name: "gasInitialPressureKPa", type: "number", unit: "kPa", bounds: "50..300" },
    { name: "gasInitialTempC", type: "number", unit: "°C", bounds: "10..35" },
    { name: "gasFinalTempC", type: "number", unit: "°C", bounds: "> gasInitialTempC + 20" },
  ],
  physicalConstraints: [
    "thetaMeltC exceeds thetaStartC by at least 15 °C",
    "Uses NCUK temperature conversion T / K = θ / °C + 273.2",
    "SVG displays labelled plateau curve and public temperatures with zero leaked energies or times",
  ],
  probeSpecs: [
    {
      kind: "thermal-phase-cooling-gas-10m",
      curveMode: "heating-plateau",
      massKg: 0.24,
      specificHeatSolidJKgK: 1850,
      latentHeatFusionJKg: 148000,
      thetaStartC: 20,
      thetaMeltC: 64,
      heaterPowerW: 85,
      thermalEfficiency: 0.82,
      gasInitialPressureKPa: 102,
      gasInitialTempC: 20,
      gasFinalTempC: 92,
    },
    {
      kind: "thermal-phase-cooling-gas-10m",
      curveMode: "cooling-plateau",
      massKg: 0.35,
      specificHeatSolidJKgK: 1420,
      latentHeatFusionJKg: 112000,
      thetaStartC: 22,
      thetaMeltC: 78,
      heaterPowerW: 110,
      thermalEfficiency: 0.78,
      gasInitialPressureKPa: 114,
      gasInitialTempC: 22,
      gasFinalTempC: 110,
    },
  ],
  validate: validateThermal10mSpec,
  solve: solveThermal10mSpec,
  renderSvg: renderThermal10mSvg,
};

// ============================================================================
// PLUGIN 4: synoptic-density-statics-energy-10m (mechanics)
// ============================================================================

export const SYNOPTIC_GEOMETRY_MODES = [
  "semi-annular-channel",
  "rectangular-slab",
] as const;

export type SynopticGeometryMode = (typeof SYNOPTIC_GEOMETRY_MODES)[number];

interface SynopticMechanics10mSpec {
  readonly kind: "synoptic-density-statics-energy-10m";
  readonly geometryMode: SynopticGeometryMode;
  readonly outerWidthM: number;
  readonly innerOrHeightM: number;
  readonly lengthM: number;
  readonly densityKgM3: number;
  readonly cgFraction: number;
  readonly motorInputPowerW: number;
  readonly motorEfficiency: number;
}

function validateSynoptic10mSpec(
  spec: Record<string, unknown>,
): DomainValidationResult {
  const issues: string[] = [];
  if (spec.kind !== "synoptic-density-statics-energy-10m") {
    issues.push('kind must equal "synoptic-density-statics-energy-10m"');
  }
  if (
    typeof spec.geometryMode !== "string" ||
    !(SYNOPTIC_GEOMETRY_MODES as readonly string[]).includes(spec.geometryMode)
  ) {
    issues.push(
      `geometryMode must be one of: ${SYNOPTIC_GEOMETRY_MODES.join(", ")}`,
    );
  }

  const numFields = [
    "outerWidthM",
    "innerOrHeightM",
    "lengthM",
    "densityKgM3",
    "cgFraction",
    "motorInputPowerW",
    "motorEfficiency",
  ] as const;
  for (const f of numFields) {
    if (!isFiniteNumber(spec[f])) {
      issues.push(`${f} must be a finite number`);
    }
  }
  if (issues.length > 0) return { valid: false, issues };

  const s = spec as unknown as SynopticMechanics10mSpec;
  if (s.outerWidthM < 0.1 || s.outerWidthM > 0.6) {
    issues.push("outerWidthM must be in [0.10, 0.60] m");
  }
  if (s.innerOrHeightM < 0.04 || s.innerOrHeightM > 0.45) {
    issues.push("innerOrHeightM must be in [0.04, 0.45] m");
  }
  if (
    s.geometryMode === "semi-annular-channel" &&
    s.outerWidthM - s.innerOrHeightM < 0.03
  ) {
    issues.push(
      "For semi-annular-channel, outer diameter must exceed inner diameter by at least 0.03 m",
    );
  }
  if (s.lengthM < 1.5 || s.lengthM > 5.0) {
    issues.push("lengthM must be in [1.5, 5.0] m");
  }
  if (s.densityKgM3 < 600 || s.densityKgM3 > 9000) {
    issues.push("densityKgM3 must be in [600, 9000] kg m⁻³");
  }
  if (s.cgFraction < 0.35 || s.cgFraction > 0.55) {
    issues.push("cgFraction must be in [0.35, 0.55]");
  }
  if (s.motorInputPowerW < 100 || s.motorInputPowerW > 2500) {
    issues.push("motorInputPowerW must be in [100, 2500] W");
  }
  if (s.motorEfficiency <= 0.4 || s.motorEfficiency > 0.98) {
    issues.push("motorEfficiency must be in (0.4, 0.98]");
  }

  return { valid: issues.length === 0, issues };
}

function solveSynoptic10mSpec(
  spec: Record<string, unknown>,
): DomainSolveOutput {
  const check = validateSynoptic10mSpec(spec);
  if (!check.valid) {
    throw new Error(check.issues.join("; "));
  }
  const s = spec as unknown as SynopticMechanics10mSpec;
  const crossSectionAreaM2 =
    s.geometryMode === "semi-annular-channel"
      ? 0.5 *
        (Math.PI / 4) *
        (s.outerWidthM * s.outerWidthM - s.innerOrHeightM * s.innerOrHeightM)
      : s.outerWidthM * s.innerOrHeightM;
  const volumeM3 = crossSectionAreaM2 * s.lengthM;
  const massKg = s.densityKgM3 * volumeM3;
  const weightN = massKg * NCUK_GRAVITY_MS2;
  const cgDistanceFromPivotM = s.cgFraction * s.lengthM;
  const liftForceN = weightN * s.cgFraction;
  const deltaGpeJ = weightN * cgDistanceFromPivotM;
  const usefulMotorPowerW = s.motorEfficiency * s.motorInputPowerW;
  const liftTimeS = deltaGpeJ / usefulMotorPowerW;

  const quantities: VerifiedQuantityMap = {
    geometryMode: s.geometryMode,
    crossSectionAreaM2,
    volumeM3,
    massKg,
    weightN,
    cgDistanceFromPivotM,
    liftForceN,
    deltaGpeJ,
    usefulMotorPowerW,
    liftTimeS,
    assumptionClassification:
      "density is uniform and negligible work is done against friction or giving kinetic energy to the beam",
    energyLossMechanism:
      "electrical heating in the motor windings and friction in the hoist gears dissipate thermal energy to the surroundings",
    cgTrapExplanation:
      "centre of gravity rises by half the length rather than the full length when stood upright",
  };

  return {
    solverId: "sixthphysics/ncuk-synoptic-mechanics-10m/1.0.0",
    quantities,
  };
}

function renderSynoptic10mSvg(
  spec: Record<string, unknown>,
): DomainRenderOutput {
  const check = validateSynoptic10mSpec(spec);
  if (!check.valid) {
    throw new Error(check.issues.join("; "));
  }
  const s = spec as unknown as SynopticMechanics10mSpec;

  const width = 720;
  const height = 430;
  const isSemi = s.geometryMode === "semi-annular-channel";
  const isUniform = Math.abs(s.cgFraction - 0.5) < 1e-6;
  const outerCm = s.outerWidthM * 100;
  const innerCm = s.innerOrHeightM * 100;
  const cgM = s.cgFraction * s.lengthM;

  const desc = isSemi
    ? "Cross-section and side elevation of a semi-annular concrete channel resting horizontally on level ground with upward lifting force F at end B"
    : "Cross-section and side elevation of a rectangular structural beam resting horizontally on level ground with upward lifting force F at end B";

  const publicNumbers: number[] = [
    s.outerWidthM,
    s.innerOrHeightM,
    outerCm,
    innerCm,
    s.lengthM,
  ];
  if (!isUniform) {
    publicNumbers.push(cgM);
  }

  const dimOuterLbl = `${isSemi ? "D" : "w"} = ${formatCleanDim(outerCm, 1)} cm`;
  const dimInnerLbl = `${isSemi ? "d" : "h"} = ${formatCleanDim(innerCm, 1)} cm`;
  const dimLenLbl = `L = ${formatCleanDim(s.lengthM, 2)} m`;
  const dimCgLbl = `x = ${formatCleanDim(cgM, 2)} m`;

  const publicLabels: string[] = [
    "Cross-section",
    "Side elevation",
    dimOuterLbl,
    dimInnerLbl,
    dimLenLbl,
    "A",
    "B",
    "G",
    "F",
    "Level ground",
  ];
  if (!isUniform) {
    publicLabels.push(dimCgLbl);
  }

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(desc)}">`,
  );
  parts.push(`<title>${escapeXml(desc)}</title>`);
  parts.push(`<defs>`);
  parts.push(
    `<marker id="syn-arrow-dark" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#334155"/></marker>`,
  );
  parts.push(
    `<marker id="syn-arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#1d4ed8"/></marker>`,
  );
  parts.push(`</defs>`);
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);

  // Panel headers & subtle divider
  parts.push(
    `<line x1="256" y1="32" x2="256" y2="394" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="6 5"/>`,
  );
  parts.push(
    `<text x="128" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">Cross-section</text>`,
  );
  parts.push(
    `<text x="488" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">Side elevation</text>`,
  );

  // LEFT PANEL: Cross-section
  if (isSemi) {
    const cx = 128;
    const cy = 200;
    const rOut = 78;
    const rIn = Math.max(26, Math.min(58, (s.innerOrHeightM / s.outerWidthM) * rOut));
    // Lower U-shaped semi-annular trough
    const dPath = [
      `M ${coord(cx - rOut)} ${coord(cy)}`,
      `A ${coord(rOut)} ${coord(rOut)} 0 0 0 ${coord(cx + rOut)} ${coord(cy)}`,
      `L ${coord(cx + rIn)} ${coord(cy)}`,
      `A ${coord(rIn)} ${coord(rIn)} 0 0 1 ${coord(cx - rIn)} ${coord(cy)}`,
      "Z",
    ].join(" ");
    parts.push(
      `<path d="${dPath}" fill="#cbd5e1" stroke="#0f172a" stroke-width="2.2"/>`,
    );

    // Inner diameter arrow above top face
    parts.push(
      `<line x1="${coord(cx - rIn)}" y1="${coord(cy - 26)}" x2="${coord(cx + rIn)}" y2="${coord(cy - 26)}" stroke="#334155" stroke-width="1.5" marker-start="url(#syn-arrow-dark)" marker-end="url(#syn-arrow-dark)"/>`,
    );
    parts.push(
      `<line x1="${coord(cx - rIn)}" y1="${coord(cy - 4)}" x2="${coord(cx - rIn)}" y2="${coord(cy - 32)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
    parts.push(
      `<line x1="${coord(cx + rIn)}" y1="${coord(cy - 4)}" x2="${coord(cx + rIn)}" y2="${coord(cy - 32)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
    parts.push(
      `<text x="${coord(cx)}" y="${coord(cy - 36)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#0f172a">${escapeXml(dimInnerLbl)}</text>`,
    );

    // Outer diameter arrow below trough
    parts.push(
      `<line x1="${coord(cx - rOut)}" y1="${coord(cy + rOut + 30)}" x2="${coord(cx + rOut)}" y2="${coord(cy + rOut + 30)}" stroke="#334155" stroke-width="1.5" marker-start="url(#syn-arrow-dark)" marker-end="url(#syn-arrow-dark)"/>`,
    );
    parts.push(
      `<line x1="${coord(cx - rOut)}" y1="${coord(cy + 4)}" x2="${coord(cx - rOut)}" y2="${coord(cy + rOut + 36)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
    parts.push(
      `<line x1="${coord(cx + rOut)}" y1="${coord(cy + 4)}" x2="${coord(cx + rOut)}" y2="${coord(cy + rOut + 36)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
    parts.push(
      `<text x="${coord(cx)}" y="${coord(cy + rOut + 52)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#0f172a">${escapeXml(dimOuterLbl)}</text>`,
    );
  } else {
    const rw = 128;
    const rh = Math.max(46, Math.min(92, (s.innerOrHeightM / s.outerWidthM) * rw));
    const rx = 128 - rw / 2;
    const ry = 215 - rh / 2;
    parts.push(
      `<rect x="${coord(rx)}" y="${coord(ry)}" width="${coord(rw)}" height="${coord(rh)}" fill="#cbd5e1" stroke="#0f172a" stroke-width="2.2"/>`,
    );
    // Width dimension below
    parts.push(
      `<line x1="${coord(rx)}" y1="${coord(ry + rh + 28)}" x2="${coord(rx + rw)}" y2="${coord(ry + rh + 28)}" stroke="#334155" stroke-width="1.5" marker-start="url(#syn-arrow-dark)" marker-end="url(#syn-arrow-dark)"/>`,
    );
    parts.push(
      `<text x="${coord(rx + rw / 2)}" y="${coord(ry + rh + 48)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="bold" fill="#0f172a">${escapeXml(dimOuterLbl)}</text>`,
    );
    // Height dimension to the left
    parts.push(
      `<line x1="${coord(rx - 22)}" y1="${coord(ry)}" x2="${coord(rx - 22)}" y2="${coord(ry + rh)}" stroke="#334155" stroke-width="1.5" marker-start="url(#syn-arrow-dark)" marker-end="url(#syn-arrow-dark)"/>`,
    );
    parts.push(
      `<text x="${coord(rx - 28)}" y="${coord(ry + rh / 2 + 4)}" text-anchor="end" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#0f172a">${escapeXml(dimInnerLbl)}</text>`,
    );
  }

  // RIGHT PANEL: Side elevation on ground
  const bx1 = 310;
  const bx2 = 646;
  const bw = bx2 - bx1;
  const groundY = 286;
  const beamH = 44;
  const beamY = groundY - beamH;

  // Ground line & hatch marks
  parts.push(
    `<line x1="284" y1="${coord(groundY)}" x2="682" y2="${coord(groundY)}" stroke="#334155" stroke-width="2.2"/>`,
  );
  for (let gx = 292; gx <= 676; gx += 18) {
    parts.push(
      `<line x1="${coord(gx)}" y1="${coord(groundY)}" x2="${coord(gx - 8)}" y2="${coord(groundY + 10)}" stroke="#94a3b8" stroke-width="1.2"/>`,
    );
  }
  parts.push(
    `<text x="676" y="${coord(groundY + 26)}" text-anchor="end" font-family="Arial, sans-serif" font-size="11.5" fill="#475569">Level ground</text>`,
  );

  // Horizontal beam body
  parts.push(
    `<rect x="${coord(bx1)}" y="${coord(beamY)}" width="${coord(bw)}" height="${coord(beamH)}" fill="#e2e8f0" stroke="#0f172a" stroke-width="2.2"/>`,
  );

  // Pivot triangle highlight at end A & labels A, B
  parts.push(
    `<circle cx="${coord(bx1)}" cy="${coord(groundY)}" r="4.5" fill="#0f172a"/>`,
  );
  parts.push(
    `<text x="${coord(bx1 - 12)}" y="${coord(beamY + beamH / 2 + 5)}" text-anchor="end" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">A</text>`,
  );
  parts.push(
    `<text x="${coord(bx2 + 12)}" y="${coord(beamY + beamH / 2 + 5)}" text-anchor="start" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#0f172a">B</text>`,
  );

  // Centre of gravity marker G
  const cgX = bx1 + s.cgFraction * bw;
  const cgY = beamY + beamH / 2;
  parts.push(
    `<circle cx="${coord(cgX)}" cy="${coord(cgY)}" r="5" fill="#b91c1c"/>`,
  );
  parts.push(
    `<text x="${coord(cgX)}" y="${coord(beamY - 12)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#b91c1c">G</text>`,
  );

  // If non-uniform, show explicit cg distance bracket from A to G
  if (!isUniform) {
    parts.push(
      `<line x1="${coord(bx1)}" y1="${coord(beamY - 38)}" x2="${coord(cgX)}" y2="${coord(beamY - 38)}" stroke="#b91c1c" stroke-width="1.4" marker-start="url(#syn-arrow-dark)" marker-end="url(#syn-arrow-dark)"/>`,
    );
    parts.push(
      `<line x1="${coord(bx1)}" y1="${coord(beamY - 4)}" x2="${coord(bx1)}" y2="${coord(beamY - 44)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
    parts.push(
      `<line x1="${coord(cgX)}" y1="${coord(beamY - 26)}" x2="${coord(cgX)}" y2="${coord(beamY - 44)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3"/>`,
    );
    parts.push(
      `<text x="${coord((bx1 + cgX) / 2)}" y="${coord(beamY - 48)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#b91c1c">${escapeXml(dimCgLbl)}</text>`,
    );
  }

  // Upward lifting force arrow F at end B (NO numeric force value printed!)
  parts.push(
    `<line x1="${coord(bx2)}" y1="${coord(beamY)}" x2="${coord(bx2)}" y2="${coord(beamY - 94)}" stroke="#1d4ed8" stroke-width="2.6" marker-end="url(#syn-arrow-blue)"/>`,
  );
  parts.push(
    `<text x="${coord(bx2 + 12)}" y="${coord(beamY - 76)}" text-anchor="start" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="#1d4ed8">F</text>`,
  );

  // Overall length L dimension arrow below ground
  parts.push(
    `<line x1="${coord(bx1)}" y1="${coord(groundY + 46)}" x2="${coord(bx2)}" y2="${coord(groundY + 46)}" stroke="#334155" stroke-width="1.6" marker-start="url(#syn-arrow-dark)" marker-end="url(#syn-arrow-dark)"/>`,
  );
  parts.push(
    `<line x1="${coord(bx1)}" y1="${coord(groundY + 12)}" x2="${coord(bx1)}" y2="${coord(groundY + 52)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
  );
  parts.push(
    `<line x1="${coord(bx2)}" y1="${coord(groundY + 12)}" x2="${coord(bx2)}" y2="${coord(groundY + 52)}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>`,
  );
  parts.push(
    `<text x="${coord((bx1 + bx2) / 2)}" y="${coord(groundY + 68)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#0f172a">${escapeXml(dimLenLbl)}</text>`,
  );

  parts.push("</svg>");

  return {
    visualFamily: "mechanics",
    svgMarkup: parts.join(""),
    rendererVersion: "sixthphysics/ncuk-synoptic-mechanics-10m-svg/1.0.0",
    publicNumbers,
    publicLabels,
  };
}

const SYNOPTIC_DENSITY_STATICS_ENERGY_10M_PLUGIN: DomainKindPlugin = {
  domain: "mechanics",
  kind: "synoptic-density-statics-energy-10m",
  summary:
    "10-mark NCUK IFYPH005 AC2 flagship synoptic problem combining cross-section density to mass (Show clearly that), lift moments about pivoted end, centre-of-gravity rise GPE work (L/2 trap), hoist efficiency time, and qualitative energy-loss evaluation.",
  requiredFields: [
    { name: "geometryMode", type: "string", enumValues: SYNOPTIC_GEOMETRY_MODES },
    { name: "outerWidthM", type: "number", unit: "m", bounds: "0.10..0.60" },
    { name: "innerOrHeightM", type: "number", unit: "m", bounds: "0.04..0.45" },
    { name: "lengthM", type: "number", unit: "m", bounds: "1.5..5.0" },
    { name: "densityKgM3", type: "number", unit: "kg m^-3", bounds: "600..9000" },
    { name: "cgFraction", type: "number", bounds: "0.35..0.55" },
    { name: "motorInputPowerW", type: "number", unit: "W", bounds: "100..2500" },
    { name: "motorEfficiency", type: "number", bounds: "(0.4, 0.98]" },
  ],
  physicalConstraints: [
    "Uses NCUK g = 9.81 m s⁻² throughout",
    "For semi-annular-channel, outer diameter exceeds inner diameter by at least 0.03 m",
    "SVG displays cross-section and side elevation dimensions only, with zero leaked mass, force, work, or time",
  ],
  probeSpecs: [
    {
      kind: "synoptic-density-statics-energy-10m",
      geometryMode: "semi-annular-channel",
      outerWidthM: 0.2,
      innerOrHeightM: 0.12,
      lengthM: 2.8,
      densityKgM3: 2400,
      cgFraction: 0.5,
      motorInputPowerW: 420,
      motorEfficiency: 0.75,
    },
    {
      kind: "synoptic-density-statics-energy-10m",
      geometryMode: "rectangular-slab",
      outerWidthM: 0.24,
      innerOrHeightM: 0.14,
      lengthM: 3.2,
      densityKgM3: 2350,
      cgFraction: 0.44,
      motorInputPowerW: 650,
      motorEfficiency: 0.8,
    },
  ],
  validate: validateSynoptic10mSpec,
  solve: solveSynoptic10mSpec,
  renderSvg: renderSynoptic10mSvg,
};

export const NCUK_QUAL_EXAM_PLUGINS: readonly DomainKindPlugin[] = [
  CONCEPTUAL_CLASSIFICATION_PLUGIN,
  FALSE_ORIGIN_GRADIENT_PLUGIN,
  THERMAL_PHASE_COOLING_GAS_10M_PLUGIN,
  SYNOPTIC_DENSITY_STATICS_ENERGY_10M_PLUGIN,
];
