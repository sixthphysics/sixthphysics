import type { PhysicsDomainId, PublicBankItem, PublicBankManifest } from "./types";

/**
 * Deterministic 18-item verified fallback seed across IB Physics (SL/HL),
 * UK A-Level Physics (Y12/Y13), and NCUK IFY Physics (IFY/S1/S2) so unit tests
 * and fresh builds work cleanly even when `dataset/` is absent.
 */
export const SEED_FALLBACK_ITEMS: readonly PublicBankItem[] = [
  {
    "id": "sp-v2-graphs-mcq-0081",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-a",
        "subtopicId": "ib-a2-forces-momentum"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec4-mechanics-materials",
        "subtopicId": "alevel-3-4-1-force-energy-momentum"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac2",
        "subtopicId": "ncuk-ac2-6"
      }
    ],
    "format": "mcq",
    "difficulty": "standard",
    "visualFamily": "cartesian_plot",
    "stem": "Motion sensors track the momentum of a satellite attitude-test mass of mass 3.2 kg. Determine the magnitude of the resultant force acting from t = 3.0 s to t = 8.0 s.",
    "workedSolution": "By Newton's second law, F = Δp / Δt = (22.4 − 6.4) / (8 − 3) = 3.20 N.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Evaluates F = Δp / Δt = (22.4 − 6.4) / (5) = 3.20 N (B).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "linear-momentum-impulse",
    "familyGroupKey": "linear-momentum-impulse::pt-momentum-gradient-kinetic-work",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"500\" viewBox=\"0 0 720 500\" role=\"img\" aria-label=\"momentum / kg m s⁻¹ against time / s\"><rect width=\"720\" height=\"500\" fill=\"white\"/><defs><clipPath id=\"plot-sp-v2-graphs-mcq-0081-figure\"><rect x=\"112\" y=\"38\" width=\"528\" height=\"378\"/></clipPath></defs><path d=\"M112 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M156 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M200 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M244 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M288 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M332 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M376 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M420 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M464 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M508 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M552 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M596 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M640 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 416H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 373.8125H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 331.625H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 289.4375H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 247.25H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 205.0625H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 162.875H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 120.6875H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 78.5H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M200 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M288 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M376 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M464 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M552 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M640 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 416H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 331.625H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 247.25H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 162.875H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 78.5H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 416H640\" fill=\"none\" stroke=\"#202429\" stroke-width=\"1.7\"/><path d=\"M112 416V38\" fill=\"none\" stroke=\"#202429\" stroke-width=\"1.7\"/><path d=\"M112 411v10\" stroke=\"#202429\"/><text x=\"112\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">0</text><path d=\"M200 411v10\" stroke=\"#202429\"/><text x=\"200\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">2</text><path d=\"M288 411v10\" stroke=\"#202429\"/><text x=\"288\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">4</text><path d=\"M376 411v10\" stroke=\"#202429\"/><text x=\"376\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">6</text><path d=\"M464 411v10\" stroke=\"#202429\"/><text x=\"464\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">8</text><path d=\"M552 411v10\" stroke=\"#202429\"/><text x=\"552\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">10</text><path d=\"M640 411v10\" stroke=\"#202429\"/><text x=\"640\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">12</text><path d=\"M107 416h10\" stroke=\"#202429\"/><text x=\"100\" y=\"421.95\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">0</text><path d=\"M107 331.625h10\" stroke=\"#202429\"/><text x=\"100\" y=\"337.575\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">5</text><path d=\"M107 247.25h10\" stroke=\"#202429\"/><text x=\"100\" y=\"253.2\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">10</text><path d=\"M107 162.875h10\" stroke=\"#202429\"/><text x=\"100\" y=\"168.825\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">15</text><path d=\"M107 78.5h10\" stroke=\"#202429\"/><text x=\"100\" y=\"84.45\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">20</text><path d=\"M112 308 L244 308 L464 38 L640 38\" fill=\"none\" stroke=\"#15191d\" stroke-width=\"2.2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" clip-path=\"url(#plot-sp-v2-graphs-mcq-0081-figure)\"/><text x=\"376\" y=\"480\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">time / s</text><text transform=\"translate(28 227) rotate(-90)\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">momentum / kg m s⁻¹</text></svg>",
    "options": [
      {
        "label": "A",
        "text": "80.0 N",
        "isCorrect": false,
        "distractorRationale": "Multiplies Δp by Δt instead of evaluating the rate of change of momentum Δp / Δt."
      },
      {
        "label": "B",
        "text": "3.20 N",
        "isCorrect": true
      },
      {
        "label": "C",
        "text": "1.00 N",
        "isCorrect": false,
        "distractorRationale": "Divides Δp / Δt by mass m, obtaining acceleration rather than resultant force."
      },
      {
        "label": "D",
        "text": "2.80 N",
        "isCorrect": false,
        "distractorRationale": "Computes the secant ratio p₂ / t₂ from the origin, ignoring both initial momentum p₁ and start time t₁."
      }
    ],
    "correctOptionIndex": 1
  },
  {
    "id": "sp-circuits-11-structured-235",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-b",
        "subtopicId": "ib-b5-current-circuits"
      },
      {
        "syllabus": "alevel",
        "level": "Y12",
        "topicId": "alevel-sec5-electricity",
        "subtopicId": "alevel-3-5-1-current-electricity"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-2"
      }
    ],
    "format": "structured",
    "difficulty": "foundation",
    "visualFamily": "circuit_network",
    "stem": "Refer to a seed-germination tray warming wire illustrated: resistive element R_1 is fabricated from 2.55 m of 0.46 mm diameter platinum-iridium wire (resistivity 2.50 × 10⁻⁷ Ω m) on an ideal 24 V supply.",
    "workedSolution": "(a) A = π d² / 4 = 1.66 × 10⁻⁷ m², giving R_1 = ρL / A = 3.84 Ω. (b) I = 24 / 3.84 = 6.26 A. (c) P = V I = 150 W.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Computes circular area π(d/2)² in m² and applies R = ρL / A.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains R_1 = 3.84 Ω.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Divides 24 V by R_1.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains I = 6.26 A.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Applies P = V I or V² / R_1.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains P = 150 W.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "resistivity-ohmic-conductors",
    "familyGroupKey": "resistivity-ohmic-conductors::cylindrical-wire-resistivity-circuit",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"760\" height=\"500\" viewBox=\"0 0 760 500\" role=\"img\" aria-label=\"Circuit diagram with 2 components\"><rect width=\"760\" height=\"500\" fill=\"white\"/><defs><marker id=\"circuit-arrow-sp-circuits-11-structured-235-figure\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker></defs><path data-wire-id=\"sp-circuits-11-structured-235-figure-main-wire-1\" d=\"M101.12 142.021818L101.12 250\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-circuits-11-structured-235-figure-main-wire-2\" d=\"M101.12 250L101.12 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-circuits-11-structured-235-figure-main-wire-3\" d=\"M658.88 142.021818L658.88 250\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-circuits-11-structured-235-figure-main-wire-4\" d=\"M658.88 250L658.88 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path d=\"M101.12 142.021818L370 142.021818M390 142.021818L658.88 142.021818\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(380 142.021818) rotate(0)\"><g data-component-id=\"supply\" data-component-kind=\"cell\"><path d=\"M-6 -22V22M7 -13V13\" stroke=\"#171b1f\" stroke-width=\"2\"/></g></g><text x=\"380\" y=\"178.021818\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">24 V</text><path d=\"M101.12 357.978182L340 357.978182M420 357.978182L658.88 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(380 357.978182) rotate(0)\"><rect data-component-id=\"r1\" data-component-kind=\"resistor\" x=\"-38\" y=\"-14\" width=\"76\" height=\"28\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/></g><text x=\"380\" y=\"393.978182\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">R_1</text></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the resistance of the cylindrical wire R_1.",
        "marks": 2,
        "targetQuantityKey": "parallelOhm",
        "expectedAnswer": "3.84 Ω",
        "workingSteps": [
          "A = π(d/2)² = π(0.46 × 10⁻³ / 2)² = 1.66 × 10⁻⁷ m².",
          "R_1 = ρL / A = 3.84 Ω."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the current in the wire.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "totalCurrentA",
        "expectedAnswer": "6.26 A",
        "workingSteps": [
          "I = V / R_1 = 24 / 3.84 = 6.26 A."
        ]
      },
      {
        "partId": "c",
        "prompt": "Determine the thermal power dissipated in the wire.",
        "marks": 2,
        "dependsOnPartIds": [
          "a",
          "b"
        ],
        "targetQuantityKey": "branchOnePowerW",
        "expectedAnswer": "150 W",
        "workingSteps": [
          "P = V × I = 24 × 6.26 = 150 W."
        ]
      }
    ]
  },
  {
    "id": "sp-fields-mcq-0071",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-d",
        "subtopicId": "ib-d2-electric-magnetic-fields"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec7-fields-consequences",
        "subtopicId": "alevel-3-7-3-electric-fields"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-5"
      }
    ],
    "format": "mcq",
    "difficulty": "higher",
    "visualFamily": "field_map",
    "stem": "On a low-permittivity PTFE fixture inside an evacuated chamber, on a straight vacuum baseline of total length 3 x between +9Q on the left and +5Q on the right, point P lies 2 x from the left source. Using Coulomb constant k, what is the resultant electric field at P expressed in terms of kQ/x²?",
    "workedSolution": "At P, +9Q produces (9/2²) kQ/x² = 2.25 kQ/x² to the right, while +5Q at distance 1 x produces (5/1²) kQ/x² = 5.00 kQ/x² to the left. Net field = 2.75 kQ/x² to the left (C).",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Subtracts (9/2²) and (5/1²) to obtain 2.75 kQ/x² to the left (C).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "electrostatic-coulomb-uniform-fields",
    "familyGroupKey": "electrostatic-coulomb-uniform-fields::symbolic-superposition-field-multiple",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"500\" viewBox=\"0 0 800 500\" role=\"img\" aria-label=\"Field diagram with 2 source or marker entities\"><rect width=\"800\" height=\"500\" fill=\"white\"/><defs><marker id=\"field-arrow-sp-fields-mcq-0071-figure\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker><marker id=\"field-reverse-arrow-sp-fields-mcq-0071-figure\" viewBox=\"0 0 10 10\" refX=\"2\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M10 0L0 5L10 10Z\" fill=\"#59656c\"/></marker></defs><path data-path-id=\"baseline\" d=\"M107.68 233.84L706.24 233.84\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-dasharray=\"8 6\"/><path data-path-id=\"total\" d=\"M177.28 363.12L622.72 363.12\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" marker-start=\"url(#field-reverse-arrow-sp-fields-mcq-0071-figure)\" marker-end=\"url(#field-arrow-sp-fields-mcq-0071-figure)\"/><text x=\"400\" y=\"354.12\" text-anchor=\"middle\" font-size=\"15\" font-family=\"Arial, sans-serif\">d</text><path data-path-id=\"dimension-extension-1\" d=\"M177.28 245.96L177.28 375.24\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path data-path-id=\"dimension-extension-2\" d=\"M622.72 245.96L622.72 375.24\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><g data-entity-id=\"left-charge\"><circle cx=\"177.28\" cy=\"233.84\" r=\"18\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/><text x=\"177.28\" y=\"239.84\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">+</text><text x=\"177.28\" y=\"262.84\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">q₁</text></g><g data-entity-id=\"right-charge\"><circle cx=\"622.72\" cy=\"233.84\" r=\"18\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/><text x=\"622.72\" y=\"239.84\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">+</text><text x=\"622.72\" y=\"262.84\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">q₂</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "2.75 kQ/x² to the right",
        "isCorrect": false,
        "distractorRationale": "Evaluates the correct inverse-square difference coefficient but reverses the resultant field direction."
      },
      {
        "label": "B",
        "text": "7.25 kQ/x² to the left",
        "isCorrect": false,
        "distractorRationale": "Adds the two field magnitudes between two positive charges instead of subtracting opposing vectors."
      },
      {
        "label": "C",
        "text": "2.75 kQ/x² to the left",
        "isCorrect": true
      },
      {
        "label": "D",
        "text": "0.500 kQ/x² to the left",
        "isCorrect": false,
        "distractorRationale": "Divides by unsquared distance ratios instead of squaring the distances from each charge."
      }
    ],
    "correctOptionIndex": 2
  },
  {
    "id": "sp-mech-structured-0057",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-a",
        "subtopicId": "ib-a2-forces-momentum"
      },
      {
        "syllabus": "alevel",
        "level": "Y12",
        "topicId": "alevel-sec4-mechanics-materials",
        "subtopicId": "alevel-3-4-1-force-energy-momentum"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S1",
        "topicId": "ncuk-ac2",
        "subtopicId": "ncuk-ac2-6"
      }
    ],
    "format": "structured",
    "difficulty": "foundation",
    "visualFamily": "mechanics_scene",
    "stem": "On a smooth glass collision groove, trolley X of mass 4 kg moves to the right at 7 m s⁻¹ and collides head-on with trolley Y of mass 2.4 kg moving to the left at 2 m s⁻¹ (arrow on Y not shown). Immediately after impact, trolley Y moves to the right at 5 m s⁻¹. Take motion to the right as positive.",
    "workedSolution": "(a) p_before = 4 × 7 + 2.4 × (−2) = 23.2 kg m s⁻¹. Answer: 23.2 kg m s⁻¹ to the right. (b) v_X = (23.2 − 2.4 × 5) / 4 = 2.80 m s⁻¹. Answer: 2.80 m s⁻¹ to the right.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Evaluates m_X u_X − m_Y |u_Y| with correct signs.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains 23.2 kg m s⁻¹ to the right.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Solves p_before = m_X v_X + m_Y v_Y for v_X.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains 2.80 m s⁻¹ to the right.",
        "marks": 1
      }
    ],
    "totalMarks": 4,
    "conceptId": "linear-momentum-impulse",
    "familyGroupKey": "linear-momentum-impulse::head-on-signed-momentum-conservation",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"620\" height=\"430\" viewBox=\"0 0 620 430\" role=\"img\"><title>Mechanics diagram</title><desc>X, 4 kg; Y, 2.4 kg; 7 m s⁻¹</desc><defs><marker id=\"mechanics-arrow-sp-mech-structured-0057-figure\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\"/></marker></defs><g font-family=\"Arial, sans-serif\" font-size=\"15\"><polyline points=\"158.8,262.6 461.2,262.6\" fill=\"none\" stroke=\"#202020\" stroke-width=\"2\"/><g transform=\"translate(230.8 241) rotate(0)\"><rect x=\"-19\" y=\"-13\" width=\"38\" height=\"26\" fill=\"white\" stroke=\"#202020\" stroke-width=\"2\"/><circle cx=\"-12\" cy=\"17\" r=\"4\"/><circle cx=\"12\" cy=\"17\" r=\"4\"/></g><text x=\"230.8\" y=\"216\" text-anchor=\"middle\">X, 4 kg</text><g transform=\"translate(392.8 241) rotate(0)\"><rect x=\"-19\" y=\"-13\" width=\"38\" height=\"26\" fill=\"white\" stroke=\"#202020\" stroke-width=\"2\"/><circle cx=\"-12\" cy=\"17\" r=\"4\"/><circle cx=\"12\" cy=\"17\" r=\"4\"/></g><text x=\"392.8\" y=\"216\" text-anchor=\"middle\">Y, 2.4 kg</text><line x1=\"230.8\" y1=\"241\" x2=\"313.6\" y2=\"241\" stroke=\"#202020\" stroke-width=\"2\" marker-end=\"url(#mechanics-arrow-sp-mech-structured-0057-figure)\"/><text x=\"313.6\" y=\"229\" text-anchor=\"middle\">7 m s⁻¹</text><text x=\"310\" y=\"418\" text-anchor=\"middle\" font-size=\"12\">Diagrams not to scale</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the total momentum of the two-body system before the collision.",
        "marks": 2,
        "targetQuantityKey": "momentumBeforeKgMs",
        "expectedAnswer": "23.2 kg m s⁻¹ to the right",
        "workingSteps": [
          "p_before = 4 × 7 + 2.4 × (−2) = 23.2 kg m s⁻¹.",
          "Result = 23.2 kg m s⁻¹ to the right."
        ]
      },
      {
        "partId": "b",
        "prompt": "Hence determine the velocity (magnitude and direction) of trolley X immediately after the collision.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "finalXMs",
        "expectedAnswer": "2.80 m s⁻¹ to the right",
        "workingSteps": [
          "v_X = (23.2 − 2.4 × 5) / 4 = 2.80 m s⁻¹.",
          "Result = 2.80 m s⁻¹ to the right."
        ]
      }
    ]
  },
  {
    "id": "sp-v2-waves-mcq-0127",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-c",
        "subtopicId": "ib-c3-wave-phenomena"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec3-waves",
        "subtopicId": "alevel-3-3-2-refraction-diffraction-interference"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac6",
        "subtopicId": "ncuk-ac6-4"
      }
    ],
    "format": "mcq",
    "difficulty": "higher",
    "visualFamily": "waves",
    "stem": "On a transmission diffraction grating mounted on thevernier table of a spectrometer with 500 lines mm⁻¹, the order n = 3 diffraction maximum of a monochromatic beam is measured at θ = 57.1° from the straight-through direction. What is the wavelength of the light?",
    "workedSolution": "Slit spacing d = 10⁻³ / 500 = 2.00 × 10⁻⁶ m. Rearranging d sin θ = nλ gives λ = d sin(57.1°) / 3 = 5.60 × 10⁻⁷ m.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Computes d = 10⁻³ / N and λ = d sin θ / n = 5.60 × 10⁻⁷ m (A).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "single-slit-diffraction-gratings",
    "familyGroupKey": "single-slit-diffraction-gratings::grating-lines-per-mm-diffraction-angle",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"680\" height=\"420\" viewBox=\"0 0 680 420\" role=\"img\" aria-label=\"Diffraction grating interference diagram\"><title>Diffraction grating interference diagram</title><desc>λ; θ</desc><defs><marker id=\"waves-arrow-waves-diffraction-grating-mcq-18\" viewBox=\"0 0 10 10\" refX=\"8.5\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0.5 L 10 5 L 0 9.5 z\" fill=\"#1f2937\"/></marker></defs><rect x=\"0\" y=\"0\" width=\"680\" height=\"420\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\" font-size=\"13\"><line x1=\"44\" y1=\"223\" x2=\"199\" y2=\"223\" stroke=\"#dc2626\" stroke-width=\"2.6\" marker-end=\"url(#waves-arrow-waves-diffraction-grating-mcq-18)\"/><text x=\"124.5\" y=\"209\" text-anchor=\"middle\" font-size=\"12.5\" font-weight=\"600\" fill=\"#b91c1c\">λ</text><line x1=\"205\" y1=\"149\" x2=\"205\" y2=\"297\" stroke=\"#111827\" stroke-width=\"3.5\"/><line x1=\"200\" y1=\"159\" x2=\"210\" y2=\"159\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"167\" x2=\"210\" y2=\"167\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"175\" x2=\"210\" y2=\"175\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"183\" x2=\"210\" y2=\"183\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"191\" x2=\"210\" y2=\"191\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"199\" x2=\"210\" y2=\"199\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"207\" x2=\"210\" y2=\"207\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"215\" x2=\"210\" y2=\"215\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"223\" x2=\"210\" y2=\"223\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"231\" x2=\"210\" y2=\"231\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"239\" x2=\"210\" y2=\"239\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"247\" x2=\"210\" y2=\"247\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"255\" x2=\"210\" y2=\"255\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"263\" x2=\"210\" y2=\"263\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"271\" x2=\"210\" y2=\"271\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"279\" x2=\"210\" y2=\"279\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"287\" x2=\"210\" y2=\"287\" stroke=\"#ffffff\" stroke-width=\"2\"/><path d=\"M 205 63 A 160 160 0 0 1 205 383\" fill=\"none\" stroke=\"#9ca3af\" stroke-width=\"1.5\" stroke-dasharray=\"5 4\"/><line x1=\"205\" y1=\"223\" x2=\"365\" y2=\"223\" stroke=\"#dc2626\" stroke-width=\"2\" marker-end=\"url(#waves-arrow-waves-diffraction-grating-mcq-18)\"/><text x=\"375\" y=\"227\" text-anchor=\"start\" font-size=\"12\" font-weight=\"600\" fill=\"#111827\">n = 0</text><line x1=\"205\" y1=\"223\" x2=\"343.5641\" y2=\"143\" stroke=\"#dc2626\" stroke-width=\"1.7\" stroke-dasharray=\"5 3\" marker-end=\"url(#waves-arrow-waves-diffraction-grating-mcq-18)\"/><line x1=\"205\" y1=\"223\" x2=\"343.5641\" y2=\"303\" stroke=\"#dc2626\" stroke-width=\"1.7\" stroke-dasharray=\"5 3\" marker-end=\"url(#waves-arrow-waves-diffraction-grating-mcq-18)\"/><text x=\"351.5641\" y=\"143\" text-anchor=\"start\" font-size=\"12\" fill=\"#374151\">+n</text><text x=\"351.5641\" y=\"307\" text-anchor=\"start\" font-size=\"12\" fill=\"#374151\">-n</text><path d=\"M 259 223 A 54 54 0 0 0 251.7654 196\" fill=\"none\" stroke=\"#1d4ed8\" stroke-width=\"1.5\"/><text x=\"278.4104\" y=\"204.365\" text-anchor=\"start\" font-size=\"12\" font-weight=\"600\" fill=\"#1d4ed8\">θ</text><text x=\"664\" y=\"408\" text-anchor=\"end\" font-size=\"11\" fill=\"#6b7280\">Diagram not to scale</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "5.60 × 10⁻⁷ m",
        "isCorrect": true
      },
      {
        "label": "B",
        "text": "1.03 × 10⁻⁶ m",
        "isCorrect": false,
        "distractorRationale": "Substitutes tan θ instead of sin θ into λ = d sin θ / n."
      },
      {
        "label": "C",
        "text": "1.68 × 10⁻⁶ m",
        "isCorrect": false,
        "distractorRationale": "Omits division by diffraction order n, computing λ = d sin θ."
      },
      {
        "label": "D",
        "text": "5.60 × 10⁻⁴ m",
        "isCorrect": false,
        "distractorRationale": "Forgets to convert lines per mm into lines per metre, computing d = 1 / N in metres instead of 10⁻³ / N."
      }
    ],
    "correctOptionIndex": 0
  },
  {
    "id": "sp-optics-shm-struct-0110",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-c",
        "subtopicId": "ib-c1-shm"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec6-further-mechanics-thermal",
        "subtopicId": "alevel-3-6-1-periodic-motion-shm"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac6",
        "subtopicId": "ncuk-ac6-1"
      }
    ],
    "format": "structured",
    "difficulty": "higher",
    "visualFamily": "optics-shm",
    "stem": "In a tall-building tuned mass damper block, a component oscillates in simple harmonic motion at frequency f = 6 Hz with amplitude x₀ = 0.02 m. Its instantaneous state is examined when the displacement from equilibrium is x = 0.012 m.",
    "workedSolution": "(a) ω = 2π(6) = 37.7 rad s⁻¹. (b) At x = 0.012 m, a = −ω²x = -17.1 m s⁻². (c) Maximum acceleration magnitude a_max = ω² x₀ = 28.4 m s⁻².",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Uses ω = 2πf with f = 6 Hz.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains ω = 37.7 rad s⁻¹.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Applies a = −ω²x including restoring sign.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains a = -17.1 m s⁻².",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Uses a_max = ω² x₀.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains a_max = 28.4 m s⁻².",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "simple-harmonic-motion",
    "familyGroupKey": "simple-harmonic-motion::shm-defining-acceleration-phase-portrait",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"680\" height=\"400\" viewBox=\"0 0 680 400\" role=\"img\" aria-label=\"Simple harmonic motion graph\"><title>Simple harmonic motion graph</title><desc>Simple harmonic motion kinematic and energy curves</desc><rect width=\"680\" height=\"400\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\"><rect x=\"80\" y=\"46\" width=\"550\" height=\"296\" fill=\"#ffffff\" stroke=\"#cbd5e1\" stroke-width=\"1.2\"/><line x1=\"88\" y1=\"194\" x2=\"622\" y2=\"194\" stroke=\"#64748b\" stroke-width=\"1.3\"/><line x1=\"355\" y1=\"54\" x2=\"355\" y2=\"334\" stroke=\"#64748b\" stroke-width=\"1.3\"/><text x=\"575\" y=\"210\" text-anchor=\"middle\" font-size=\"10.5\" fill=\"#475569\">+0.02</text><text x=\"135\" y=\"210\" text-anchor=\"middle\" font-size=\"10.5\" fill=\"#475569\">−0.02</text><text x=\"620\" y=\"188\" text-anchor=\"end\" font-size=\"11.5\" font-weight=\"600\" fill=\"#1e293b\">x / m</text><line x1=\"135\" y1=\"78.56\" x2=\"575\" y2=\"309.44\" stroke=\"#b91c1c\" stroke-width=\"2.4\"/><text x=\"363\" y=\"82.56\" font-size=\"10.5\" fill=\"#475569\">+a_max</text><text x=\"363\" y=\"313.44\" font-size=\"10.5\" fill=\"#475569\">−a_max</text><text x=\"363\" y=\"64\" font-size=\"11.5\" font-weight=\"600\" fill=\"#b91c1c\">a</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the angular frequency ω of the oscillation.",
        "marks": 2,
        "targetQuantityKey": "angularFrequencyRadS",
        "expectedAnswer": "37.7 rad s⁻¹",
        "workingSteps": [
          "ω = 2πf = 2π × 6 = 37.7 rad s⁻¹."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the signed acceleration a when the displacement is x = 0.012 m.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "accelerationAtQueryDisplacementMs2",
        "expectedAnswer": "-17.1 m s⁻²",
        "workingSteps": [
          "a = −ω²x = −(37.70)² × (0.012) = -17.1 m s⁻²."
        ]
      },
      {
        "partId": "c",
        "prompt": "Determine the magnitude of the maximum acceleration a_max.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "maxAccelerationMs2",
        "expectedAnswer": "28.4 m s⁻²",
        "workingSteps": [
          "a_max = ω² x₀ = (37.70)² × 0.02 = 28.4 m s⁻²."
        ]
      }
    ]
  },
  {
    "id": "sp-thermal-mcq-0030",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-b",
        "subtopicId": "ib-b1-thermal-energy-transfers"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec6-further-mechanics-thermal",
        "subtopicId": "alevel-3-6-2-thermal-physics"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S1",
        "topicId": "ncuk-ac3",
        "subtopicId": "ncuk-ac3-3"
      }
    ],
    "format": "mcq",
    "difficulty": "standard",
    "visualFamily": "thermal",
    "stem": "Inside a sealed foam-insulated metallurgical quench tank, a 0.3 kg block of melting ice at 273.15 K is placed into 0.28 kg of water initially at 289.15 K (c_water = 4180 J kg⁻¹ K⁻¹, L_f = 3.34 × 10⁵ J kg⁻¹). Because the ice mass is large, the mixture reaches phase-coexistence equilibrium at 273.15 K. What mass of ice melts?",
    "workedSolution": "Maximum heat released by water cooling to 273.15 K is Q = 0.28 × 4180 × (289.15 − 273.15) = 1.873 × 10⁴ J, which is less than m_ice L_f = 1.002 × 10⁵ J. Mass melted Δm = Q / L_f = 0.0561 kg.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Evaluates Δm = m_water c_water (T_water − 273.15) / L_f to obtain 0.0561 kg (B).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "specific-heat-latent-heat",
    "familyGroupKey": "specific-heat-latent-heat::ice-water-latent-mixing-and-coexistence",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"500\" viewBox=\"0 0 720 500\" role=\"img\" aria-label=\"Insulated calorimeter thermal equilibrium diagram\"><title>Insulated calorimeter thermal equilibrium diagram</title><desc>Insulated calorimeter thermal equilibrium diagram</desc><rect width=\"720\" height=\"500\" fill=\"white\"/><rect x=\"104\" y=\"92\" width=\"210\" height=\"290\" rx=\"6\" fill=\"#eceff2\" stroke=\"#202429\" stroke-width=\"2\"/><rect x=\"96\" y=\"78\" width=\"226\" height=\"14\" rx=\"3\" fill=\"#d9dfe5\" stroke=\"#202429\" stroke-width=\"1.8\"/><rect x=\"118\" y=\"106\" width=\"182\" height=\"262\" fill=\"white\" stroke=\"#202429\" stroke-width=\"1.6\"/><rect x=\"119\" y=\"174\" width=\"180\" height=\"193\" fill=\"#e3eef8\"/><line x1=\"119\" y1=\"174\" x2=\"299\" y2=\"174\" stroke=\"#3b5b78\" stroke-width=\"1.6\" stroke-dasharray=\"6 3\"/><rect x=\"169\" y=\"42\" width=\"8\" height=\"250\" rx=\"3\" fill=\"white\" stroke=\"#202429\" stroke-width=\"1.6\"/><circle cx=\"173\" cy=\"296\" r=\"7.5\" fill=\"#4f5962\" stroke=\"#202429\" stroke-width=\"1.6\"/><line x1=\"173\" y1=\"98\" x2=\"173\" y2=\"292\" stroke=\"#4f5962\" stroke-width=\"2.4\"/><line x1=\"253\" y1=\"48\" x2=\"253\" y2=\"309\" stroke=\"#202429\" stroke-width=\"2\"/><ellipse cx=\"253\" cy=\"312\" rx=\"14\" ry=\"4.5\" fill=\"none\" stroke=\"#202429\" stroke-width=\"2\"/><rect x=\"169\" y=\"304\" width=\"56\" height=\"42\" rx=\"4\" fill=\"#cfd6dd\" stroke=\"#202429\" stroke-width=\"1.8\"/><line x1=\"197\" y1=\"300\" x2=\"197\" y2=\"272\" stroke=\"#202429\" stroke-width=\"1.6\"/><polygon points=\"197,267 200.4,276.25 193.6,276.25\" fill=\"#202429\"/><text x=\"209\" y=\"408\" text-anchor=\"middle\" font-size=\"14\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">insulated calorimeter</text><rect x=\"389\" y=\"66\" width=\"299\" height=\"64\" rx=\"6\" fill=\"#f8fafc\" stroke=\"#c5cdd5\" stroke-width=\"1.3\"/><text x=\"403\" y=\"90\" font-size=\"14.5\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Melting ice</text><text x=\"403\" y=\"113\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">m = 0.3 kg  |  T_i = 273 K</text><rect x=\"389\" y=\"144\" width=\"299\" height=\"64\" rx=\"6\" fill=\"#f8fafc\" stroke=\"#c5cdd5\" stroke-width=\"1.3\"/><text x=\"403\" y=\"168\" font-size=\"14.5\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Water bath</text><text x=\"403\" y=\"191\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">m = 0.28 kg  |  T_i = 289 K  |  c = 4180 J kg⁻¹ K⁻¹</text><rect x=\"389\" y=\"228\" width=\"299\" height=\"48\" rx=\"6\" fill=\"#eef3f8\" stroke=\"#8a99a8\" stroke-width=\"1.4\"/><text x=\"403\" y=\"257\" font-size=\"14\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Thermal equilibrium: T_eq</text></svg>",
    "options": [
      {
        "label": "A",
        "text": "8.29 × 10⁻³ kg",
        "isCorrect": false,
        "distractorRationale": "Divides available thermal energy by the latent heat of vaporization (2.26 × 10⁶ J kg⁻¹) instead of fusion."
      },
      {
        "label": "B",
        "text": "0.0561 kg",
        "isCorrect": true
      },
      {
        "label": "C",
        "text": "0.187 kg",
        "isCorrect": false,
        "distractorRationale": "Calculates the dimensionless melted fraction Δm / m_ice instead of the melted mass Δm in kg."
      },
      {
        "label": "D",
        "text": "0.244 kg",
        "isCorrect": false,
        "distractorRationale": "Computes the mass of unmelted ice remaining at 273.15 K rather than the mass of ice that melts."
      }
    ],
    "correctOptionIndex": 1
  },
  {
    "id": "ga-circular-orbit-energy-str-104",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-d",
        "subtopicId": "ib-d1-gravitational-fields"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec7-fields-consequences",
        "subtopicId": "alevel-3-7-2-gravitational-fields"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac5",
        "subtopicId": "ncuk-ac5-1"
      }
    ],
    "format": "structured",
    "difficulty": "standard",
    "visualFamily": "grav-astro",
    "stem": "Orbital telemetry tracks a 1150 kg magnetospheric plasma observatory maintaining circular motion at height h = 1.37 × 10⁷ m above a spherical planetary body of mass 1.73 × 10²⁵ kg and radius 5.25 × 10⁶ m (G = 6.67 × 10⁻¹¹ N m² kg⁻²).",
    "workedSolution": "(a) With orbital radius r = 1.895 × 10⁷ m, g = GM/r² = 3.21 N kg⁻¹. (b) Orbital speed v = √(GM/r) = 7.80 × 10³ m s⁻¹. (c) Period T = 2πr/v = 1.53 × 10⁴ s.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Uses centre-to-centre orbital radius r in g = GM / r².",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains g = 3.21 N kg⁻¹.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Equates v²/r to g (or GM/r²).",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains v = 7.80 × 10³ m s⁻¹.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Applies T = 2πr / v or Kepler's third law.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains T = 1.53 × 10⁴ s.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "gravitational-force-field",
    "familyGroupKey": "gravitational-force-field::circular-orbit-velocity-and-kepler",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"460\" viewBox=\"0 0 720 460\" role=\"img\" aria-label=\"Orbital mechanics and energy profile diagram\"><title>Orbital mechanics and energy profile diagram</title><desc>v; r</desc><defs><marker id=\"ga-circular-orbit-energy-str-104-arrow-dark\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#1f2937\"/></marker><marker id=\"ga-circular-orbit-energy-str-104-arrow-blue\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#1d4ed8\"/></marker><marker id=\"ga-circular-orbit-energy-str-104-arrow-red\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#b91c1c\"/></marker><marker id=\"ga-circular-orbit-energy-str-104-arrow-green\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#047857\"/></marker><marker id=\"ga-circular-orbit-energy-str-104-arrow-amber\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#b45309\"/></marker></defs><rect width=\"720\" height=\"460\" fill=\"#ffffff\"/><g font-family=\"Arial, sans-serif\"><circle cx=\"360\" cy=\"239.2\" r=\"49.702\" fill=\"#e5e7eb\" stroke=\"#1f2937\" stroke-width=\"2\"/><text x=\"360\" y=\"243.2\" text-anchor=\"middle\" font-size=\"12\" fill=\"#1f2937\" font-weight=\"bold\">M</text><circle cx=\"360\" cy=\"239.2\" r=\"179.4\" fill=\"none\" stroke=\"#1d4ed8\" stroke-width=\"1.8\" stroke-dasharray=\"6 4\"/><circle cx=\"539.4\" cy=\"239.2\" r=\"5.5\" fill=\"#1f2937\"/><line x1=\"539.4\" y1=\"239.2\" x2=\"539.4\" y2=\"187.2\" stroke=\"#1d4ed8\" stroke-width=\"2\" marker-end=\"url(#ga-circular-orbit-energy-str-104-arrow-blue)\"/><text x=\"547.4\" y=\"193.2\" text-anchor=\"start\" font-size=\"11\" fill=\"#1d4ed8\">v</text><line x1=\"539.4\" y1=\"239.2\" x2=\"495.4\" y2=\"239.2\" stroke=\"#b91c1c\" stroke-width=\"2\" marker-end=\"url(#ga-circular-orbit-energy-str-104-arrow-red)\"/><text x=\"517.4\" y=\"254.2\" text-anchor=\"middle\" font-size=\"11\" fill=\"#b91c1c\">F_g</text><text x=\"360\" y=\"51.8\" text-anchor=\"middle\" font-size=\"12\" fill=\"#1d4ed8\">r</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the gravitational field strength at the satellite's orbit.",
        "marks": 2,
        "targetQuantityKey": "fieldStrengthNkg",
        "expectedAnswer": "3.21 N kg⁻¹",
        "workingSteps": [
          "r = R_p + h = 5.25 × 10⁶ + 1.37 × 10⁷ = 1.895 × 10⁷ m.",
          "g = G M / r² = (6.67 × 10⁻¹¹ × 1.73 × 10²⁵) / (1.895 × 10⁷)² = 3.21 N kg⁻¹."
        ]
      },
      {
        "partId": "b",
        "prompt": "Determine the circular orbital speed of the magnetospheric plasma observatory.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "orbitalSpeedMs",
        "expectedAnswer": "7.80 × 10³ m s⁻¹",
        "workingSteps": [
          "Setting centripetal acceleration v² / r = g gives v = √(g r) = √(G M / r).",
          "v = 7.80 × 10³ m s⁻¹."
        ]
      },
      {
        "partId": "c",
        "prompt": "Calculate the orbital period of the magnetospheric plasma observatory.",
        "marks": 2,
        "dependsOnPartIds": [
          "b"
        ],
        "targetQuantityKey": "orbitalPeriodS",
        "expectedAnswer": "1.53 × 10⁴ s",
        "workingSteps": [
          "T = 2π r / v = 2π × 1.895 × 10⁷ / 7.80 × 10³ = 1.53 × 10⁴ s."
        ]
      }
    ]
  },
  {
    "id": "sp-v2-em-induction-mcq-0095",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-d",
        "subtopicId": "ib-d4-induction"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec7-fields-consequences",
        "subtopicId": "alevel-3-7-5-magnetic-fields-induction-ac"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-6"
      }
    ],
    "format": "mcq",
    "difficulty": "higher",
    "visualFamily": "em-induction",
    "stem": "Connected to a charge integrator of total loop resistance 2 Ω, a flat earth-inductor compass loop containing 140 turns of area 0.022 m² faces normal to a field that reverses from +0.12 T to −0.120 T in 0.2 s. What total magnitude of electric charge ΔQ flows around the circuit during this reversal?",
    "workedSolution": "Signed field change |ΔB| = |-0.12 − 0.12| = 0.24 T, so |Δ(NΦ)| = 140 × 0.24 × 0.022 = 0.739 Wb. Induced charge ΔQ = |Δ(NΦ)| / R = 0.370 C.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Accounts for field sign reversal in |Δ(NΦ)| and evaluates ΔQ = |Δ(NΦ)|/R = 0.370 C (A).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "electromagnetic-induction-faraday-lenz",
    "familyGroupKey": "electromagnetic-induction-faraday-lenz::faraday-field-reversal-induced-charge",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"760\" height=\"430\" viewBox=\"0 0 760 430\" role=\"img\" aria-label=\"Magnetic flux linkage and Faraday electromagnetic induction diagram\" data-scenario-kind=\"flux-faraday\"><title>Magnetic flux linkage and Faraday electromagnetic induction diagram</title><rect width=\"760\" height=\"430\" fill=\"white\"/><defs><marker id=\"em-arrow-flux-faraday\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker></defs><g font-family=\"Arial, sans-serif\"><line x1=\"90\" y1=\"86\" x2=\"670\" y2=\"86\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"90\" y1=\"150.5\" x2=\"670\" y2=\"150.5\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"90\" y1=\"215\" x2=\"670\" y2=\"215\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"90\" y1=\"279.5\" x2=\"670\" y2=\"279.5\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"90\" y1=\"344\" x2=\"670\" y2=\"344\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"380\" y1=\"139.6\" x2=\"380\" y2=\"307.6\" stroke=\"#171b1f\" stroke-width=\"5\" stroke-linecap=\"round\"/><line x1=\"380\" y1=\"223.6\" x2=\"476\" y2=\"223.6\" stroke=\"#171b1f\" stroke-width=\"1.8\" stroke-dasharray=\"5 4\" marker-end=\"url(#em-arrow-flux-faraday)\"/><text x=\"486\" y=\"219.6\" font-size=\"14\" font-style=\"italic\" fill=\"#171b1f\">n̂</text><text x=\"90\" y=\"52\" font-size=\"14\" fill=\"#171b1f\">N = 140,  A = 0.0220 m²</text><text x=\"670\" y=\"52\" text-anchor=\"end\" font-size=\"14\" fill=\"#171b1f\">B₁ = 120 mT → B₂ = -120 mT in Δt = 200 ms</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "0.370 C",
        "isCorrect": true
      },
      {
        "label": "B",
        "text": "1.85 C",
        "isCorrect": false,
        "distractorRationale": "Divides by Δt and reports average induced current I instead of total charge ΔQ = N|ΔΦ|/R."
      },
      {
        "label": "C",
        "text": "0.185 C",
        "isCorrect": false,
        "distractorRationale": "Uses B₁ alone instead of the full signed change |B₂ − B₁| across the field polarity reversal."
      },
      {
        "label": "D",
        "text": "1.48 C",
        "isCorrect": false,
        "distractorRationale": "Multiplies |Δ(NΦ)| by resistance R instead of dividing by R."
      }
    ],
    "correctOptionIndex": 0
  },
  {
    "id": "sp-qn-structured-251",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-e",
        "subtopicId": "ib-e4-fission"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec8-nuclear-physics",
        "subtopicId": "alevel-3-8-nuclear-decay-energy"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac7",
        "subtopicId": "ncuk-ac7-3"
      }
    ],
    "format": "structured",
    "difficulty": "foundation",
    "visualFamily": "quantum-nuclear",
    "stem": "Calorimetric analysis of a spherical-tokamak deuterium-burn diagnostic shot evaluates the single-event nuclear fusion step 2 deuterons (each of mass 2.013553 u) → triton (3.015501 u) + proton (1.007276 u) (take u = 931.5 MeV c⁻², e = 1.60 × 10⁻¹⁹ C).",
    "workedSolution": "(a) Δm = Σm_reactants − Σm_products = 4.33 × 10⁻³ u. Final answer: 4.33 × 10⁻³ u. (b) Q = 4.33 × 10⁻³ × 931.5 = 4.03 MeV. Final answer: 4.03 MeV. (c) Total nucleon number A = 4. Final answer: 4.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Sums all reactant and product rest masses including particle multiplicities.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Evaluates correctly to 4.33 × 10⁻³ u.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Multiplies Δm in u by 931.5 MeV u⁻¹.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Evaluates correctly to 4.03 MeV.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Sums nucleon numbers across reactants (or products) to obtain 4.",
        "marks": 1
      }
    ],
    "totalMarks": 5,
    "conceptId": "nuclear-fission-fusion",
    "familyGroupKey": "nuclear-fission-fusion::fission-fusion-reaction-q-value",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"460\" viewBox=\"0 0 720 460\" role=\"img\" aria-label=\"Mass-energy comparison between nuclear states\"><title>Nuclear mass-energy balance diagram</title><desc>Comparison of rest mass-energy before and after nuclear binding or reaction</desc><defs><marker id=\"qn-nb-arrow-nuclear-binding\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#0f172a\"/></marker></defs><rect width=\"720\" height=\"460\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\"><text x=\"360\" y=\"30\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#0f172a\">Nuclear mass–energy balance</text><line x1=\"110\" y1=\"96\" x2=\"250\" y2=\"96\" stroke=\"#0f172a\" stroke-width=\"3\"/><text x=\"180\" y=\"84\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#0f172a\">Reactants</text><line x1=\"470\" y1=\"364\" x2=\"610\" y2=\"364\" stroke=\"#1d4ed8\" stroke-width=\"3\"/><text x=\"540\" y=\"386\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1d4ed8\">Products</text><line x1=\"250\" y1=\"96\" x2=\"506\" y2=\"96\" stroke=\"#94a3b8\" stroke-width=\"1.2\" stroke-dasharray=\"5 4\"/><line x1=\"494\" y1=\"96\" x2=\"494\" y2=\"360\" stroke=\"#dc2626\" stroke-width=\"2.2\" marker-end=\"url(#qn-nb-arrow-nuclear-binding)\"/><text x=\"506\" y=\"234\" font-size=\"13\" font-weight=\"700\" fill=\"#dc2626\">Q = Δm c²</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the rest-mass decrease Δm, in atomic mass units (u), for one fusion event.",
        "marks": 2,
        "targetQuantityKey": "massDifferenceU",
        "expectedAnswer": "4.33 × 10⁻³ u",
        "workingSteps": [
          "Δm = Σm_reactants − Σm_products = 4.33 × 10⁻³ u."
        ]
      },
      {
        "partId": "b",
        "prompt": "Determine the nuclear energy released Q, in MeV.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "qValueMeV",
        "expectedAnswer": "4.03 MeV",
        "workingSteps": [
          "Q = 4.33 × 10⁻³ × 931.5 = 4.03 MeV."
        ]
      },
      {
        "partId": "c",
        "prompt": "State the total nucleon number conserved on each side of this fusion equation.",
        "marks": 1,
        "targetQuantityKey": "totalReactantA",
        "expectedAnswer": "4",
        "workingSteps": [
          "Total nucleon number A = 4."
        ]
      }
    ]
  },
  {
    "id": "sp-v3-ncuk-ac4-ivcurve-09",
    "syllabi": [
      {
        "syllabus": "ncuk",
        "level": "IFY-S1",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-2"
      },
      {
        "syllabus": "alevel",
        "level": "Y12",
        "topicId": "alevel-sec5-electricity",
        "subtopicId": "alevel-3-5-1-current-electricity"
      }
    ],
    "format": "structured",
    "difficulty": "higher",
    "visualFamily": "graphs",
    "stem": "The graph shows the I–V characteristic recorded for an amber LED in an optics rig in an NCUK laboratory investigation, with current plotted on the vertical axis and potential difference on the horizontal axis. At the highlighted operating point, V = 2.20 V and I = 20 mA.",
    "workedSolution": "(a) R = V / I = 110.0 Ω ≈ 110 Ω. (b) connect a potential divider with a series protective resistor an ammeter in series and a voltmeter in parallel across the component and reverse the supply connections for negative readings. (c) conducts sharply above the forward threshold voltage and has very high resistance in reverse bias.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Substitutes operating-point values into R = V / I (converting mA to A if needed).",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Correct static resistance 110 Ω.",
        "marks": 1
      },
      {
        "code": "B1",
        "partId": "b",
        "criterion": "Specifies potential divider (or variable supply) with series ammeter and parallel voltmeter.",
        "marks": 1
      },
      {
        "code": "B1",
        "partId": "b",
        "criterion": "Includes a series protective resistor and reversing supply connections for negative voltages.",
        "marks": 1
      },
      {
        "code": "B1",
        "partId": "c",
        "criterion": "Correctly describes how resistance changes across the graph.",
        "marks": 1
      },
      {
        "code": "B1",
        "partId": "c",
        "criterion": "Correct microscopic explanation: conducts sharply above the forward threshold voltage and has very high resistance in reverse bias.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "ohms-law-iv-characteristics",
    "familyGroupKey": "ohms-law-iv-characteristics::ncuk-component-iv-curve-characteristic",
    "questionStyle": "mixed-exam",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"400\" viewBox=\"0 0 640 400\" role=\"img\" aria-label=\"Current against potential difference characteristic curve\"><title>Current against potential difference characteristic curve</title><defs><marker id=\"arr-iv-sp-v3-ncuk-ac4-ivcurve-0\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"7\" markerHeight=\"7\" orient=\"auto-start-reverse\"><path d=\"M 0 1 L 9 5 L 0 9 z\" fill=\"#171b1f\"/></marker></defs><rect width=\"640\" height=\"400\" fill=\"#ffffff\"/><g font-family=\"'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif\"><rect x=\"88\" y=\"38\" width=\"502\" height=\"294\" fill=\"#fbfcfd\" stroke=\"#cbd5e1\" stroke-width=\"1\"/><line x1=\"255.33\" y1=\"38\" x2=\"255.33\" y2=\"332\" stroke=\"#eef2f6\" stroke-width=\"1\"/><line x1=\"422.67\" y1=\"38\" x2=\"422.67\" y2=\"332\" stroke=\"#eef2f6\" stroke-width=\"1\"/><line x1=\"88\" y1=\"234\" x2=\"590\" y2=\"234\" stroke=\"#eef2f6\" stroke-width=\"1\"/><line x1=\"88\" y1=\"136\" x2=\"590\" y2=\"136\" stroke=\"#eef2f6\" stroke-width=\"1\"/><line x1=\"171.67\" y1=\"38\" x2=\"171.67\" y2=\"332\" stroke=\"#d8e1ea\" stroke-width=\"1.1\"/><line x1=\"339\" y1=\"38\" x2=\"339\" y2=\"332\" stroke=\"#d8e1ea\" stroke-width=\"1.1\"/><line x1=\"506.33\" y1=\"38\" x2=\"506.33\" y2=\"332\" stroke=\"#d8e1ea\" stroke-width=\"1.1\"/><line x1=\"88\" y1=\"283\" x2=\"590\" y2=\"283\" stroke=\"#d8e1ea\" stroke-width=\"1.1\"/><line x1=\"88\" y1=\"185\" x2=\"590\" y2=\"185\" stroke=\"#d8e1ea\" stroke-width=\"1.1\"/><line x1=\"88\" y1=\"87\" x2=\"590\" y2=\"87\" stroke=\"#d8e1ea\" stroke-width=\"1.1\"/><line x1=\"88\" y1=\"185\" x2=\"602\" y2=\"185\" stroke=\"#171b1f\" stroke-width=\"2\" marker-end=\"url(#arr-iv-sp-v3-ncuk-ac4-ivcurve-0)\"/><line x1=\"339\" y1=\"332\" x2=\"339\" y2=\"26\" stroke=\"#171b1f\" stroke-width=\"2\" marker-end=\"url(#arr-iv-sp-v3-ncuk-ac4-ivcurve-0)\"/><line x1=\"171.67\" y1=\"332\" x2=\"171.67\" y2=\"338\" stroke=\"#171b1f\" stroke-width=\"1.5\"/><text x=\"171.67\" y=\"354\" text-anchor=\"middle\" font-size=\"12\" fill=\"#334155\">−2</text><line x1=\"339\" y1=\"332\" x2=\"339\" y2=\"338\" stroke=\"#171b1f\" stroke-width=\"1.5\"/><text x=\"339\" y=\"354\" text-anchor=\"middle\" font-size=\"12\" fill=\"#334155\">0</text><line x1=\"506.33\" y1=\"332\" x2=\"506.33\" y2=\"338\" stroke=\"#171b1f\" stroke-width=\"1.5\"/><text x=\"506.33\" y=\"354\" text-anchor=\"middle\" font-size=\"12\" fill=\"#334155\">2</text><line x1=\"82\" y1=\"283\" x2=\"88\" y2=\"283\" stroke=\"#171b1f\" stroke-width=\"1.5\"/><text x=\"77\" y=\"287\" text-anchor=\"end\" font-size=\"12\" fill=\"#334155\">−20</text><line x1=\"82\" y1=\"185\" x2=\"88\" y2=\"185\" stroke=\"#171b1f\" stroke-width=\"1.5\"/><text x=\"77\" y=\"189\" text-anchor=\"end\" font-size=\"12\" fill=\"#334155\">0</text><line x1=\"82\" y1=\"87\" x2=\"88\" y2=\"87\" stroke=\"#171b1f\" stroke-width=\"1.5\"/><text x=\"77\" y=\"91\" text-anchor=\"end\" font-size=\"12\" fill=\"#334155\">20</text><text x=\"339\" y=\"378\" text-anchor=\"middle\" font-size=\"14\" fill=\"#171b1f\" font-weight=\"600\">Potential difference V / V</text><text x=\"24\" y=\"185\" text-anchor=\"middle\" font-size=\"14\" fill=\"#171b1f\" font-weight=\"600\" transform=\"rotate(-90 24 185)\">Current I / mA</text><path d=\"M88 185 L96.37 185 L104.73 185 L113.1 185 L121.47 185 L129.83 185 L138.2 185 L146.57 185 L154.93 185 L163.3 185 L171.67 185 L180.03 185 L188.4 185 L196.77 185 L205.13 185 L213.5 185 L221.87 185 L230.23 185 L238.6 185 L246.97 185 L255.33 185 L263.7 185 L272.07 185 L280.43 185 L288.8 185 L297.17 185 L305.53 185 L313.9 185 L322.27 185 L330.63 185 L339 185 L347.37 185 L355.73 185 L364.1 185 L372.47 185 L380.83 185 L389.2 185 L397.57 185 L405.93 185 L414.3 185 L422.67 185 L431.03 185 L439.4 185 L447.77 185 L456.13 185 L464.5 184.86 L472.87 181.97 L481.23 175.39 L489.6 165.11 L497.97 151.13 L506.33 133.45 L514.7 112.07 L523.07 87 L531.43 58.23 L539.8 43.88 L548.17 43.88 L556.53 43.88 L564.9 43.88 L573.27 43.88 L581.63 43.88 L590 43.88\" fill=\"none\" stroke=\"#1d4ed8\" stroke-width=\"2.6\"/><circle cx=\"523.07\" cy=\"87\" r=\"4.5\" fill=\"#b91c1c\" stroke=\"#ffffff\" stroke-width=\"1.5\"/></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the static resistance of the component at the highlighted operating point.",
        "marks": 2,
        "targetMode": "quantitative",
        "targetQuantityKey": "staticResistanceOhm",
        "expectedAnswer": "110 Ω",
        "workingSteps": [
          "Recall that static resistance at a point is R = V / I (not the inverse of the local tangent).",
          "Substitute V = 2.200 V and I = 0.02000 A to obtain R = 110.0 Ω ≈ 110 Ω."
        ]
      },
      {
        "partId": "b",
        "prompt": "Describe the circuit arrangement and experimental procedure used to obtain a complete I–V characteristic safely across positive and negative potential differences.",
        "marks": 2,
        "targetMode": "qualitative",
        "targetQuantityKey": "ledProcedureSummary",
        "expectedAnswer": "To obtain the full characteristic safely, connect a potential divider with a series protective resistor an ammeter in series and a voltmeter in parallel across the component and reverse the supply connections for negative readings.",
        "workingSteps": [
          "Use a potential divider to vary potential difference smoothly from zero while limiting excessive current with a protective resistor.",
          "Measure current with a series ammeter, potential difference with a parallel voltmeter, and reverse the supply leads for negative polarity."
        ]
      },
      {
        "partId": "c",
        "prompt": "Explain the physical shape of the I–V characteristic in terms of charge carriers and resistance.",
        "marks": 2,
        "targetMode": "qualitative",
        "targetQuantityKey": "behaviorSummary",
        "expectedAnswer": "The curve shows that the component conducts sharply above the forward threshold voltage and has very high resistance in reverse bias.",
        "workingSteps": [
          "Link the changing ratio of potential difference to current directly to the microscopic conduction mechanism."
        ]
      }
    ]
  },
  {
    "id": "sp-v2-circuits-mcq-0090",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-b",
        "subtopicId": "ib-b5-current-circuits"
      },
      {
        "syllabus": "alevel",
        "level": "Y12",
        "topicId": "alevel-sec5-electricity",
        "subtopicId": "alevel-3-5-1-current-electricity"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-3"
      }
    ],
    "format": "mcq",
    "difficulty": "standard",
    "visualFamily": "circuit_network",
    "stem": "In an MPPT solar-module bench test, ideal meters across a constant-r source record V_1 = 19.6 V when I_1 = 1.2 A, and V_2 = 12.6 V when I_2 = 4 A. What is the electromotive force (emf) of the source?",
    "workedSolution": "Using V = ε − I r, internal resistance r = (V_1 − V_2)/(I_2 − I_1) = (19.6 − 12.6)/(4 − 1.2) = 2.50 Ω. Substituting back gives ε = V_1 + I_1 r = 19.6 + (1.2)(2.50) = 22.6 V.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Solves simultaneous V = ε − I r equations to obtain 22.6 V.",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "emf-internal-resistance",
    "familyGroupKey": "emf-internal-resistance::two-point-vi-emf-internal-resistance",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"760\" height=\"500\" viewBox=\"0 0 760 500\" role=\"img\" aria-label=\"Circuit diagram with 3 components\"><rect width=\"760\" height=\"500\" fill=\"white\"/><defs><marker id=\"circuit-arrow-sp-v2-circuits-mcq-0090-figure\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker></defs><path data-wire-id=\"sp-v2-circuits-mcq-0090-figure-main-wire-1\" d=\"M101.12 142.021818L101.12 250\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-v2-circuits-mcq-0090-figure-main-wire-2\" d=\"M101.12 250L101.12 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-v2-circuits-mcq-0090-figure-main-wire-3\" d=\"M658.88 142.021818L658.88 250\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-v2-circuits-mcq-0090-figure-main-wire-4\" d=\"M658.88 250L658.88 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path d=\"M101.12 142.021818L370 142.021818M390 142.021818L658.88 142.021818\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(380 142.021818) rotate(0)\"><g data-component-id=\"supply\" data-component-kind=\"cell\"><path d=\"M-6 -22V22M7 -13V13\" stroke=\"#171b1f\" stroke-width=\"2\"/></g></g><text x=\"380\" y=\"178.021818\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">V</text><path d=\"M101.12 357.978182L200.56 357.978182M280.56 357.978182L380 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(240.56 357.978182) rotate(0)\"><rect data-component-id=\"r1\" data-component-kind=\"resistor\" x=\"-38\" y=\"-14\" width=\"76\" height=\"28\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/></g><text x=\"240.56\" y=\"393.978182\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">R</text><path d=\"M380 357.978182L479.44 357.978182M559.44 357.978182L658.88 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(519.44 357.978182) rotate(0)\"><rect data-component-id=\"r2\" data-component-kind=\"resistor\" x=\"-38\" y=\"-14\" width=\"76\" height=\"28\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/></g><text x=\"519.44\" y=\"393.978182\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">R</text></svg>",
    "options": [
      {
        "label": "A",
        "text": "16.1 V",
        "isCorrect": false,
        "distractorRationale": "Takes the arithmetic mean of the two terminal voltages instead of extrapolating V = ε − I r to I = 0."
      },
      {
        "label": "B",
        "text": "20.1 V",
        "isCorrect": false,
        "distractorRationale": "Uses the inverted slope ΔI / ΔV in place of internal resistance r when computing ε = V_1 + I_1 r."
      },
      {
        "label": "C",
        "text": "22.6 V",
        "isCorrect": true
      },
      {
        "label": "D",
        "text": "32.2 V",
        "isCorrect": false,
        "distractorRationale": "Adds the two measured terminal potential differences directly."
      }
    ],
    "correctOptionIndex": 2
  },
  {
    "id": "sp-fields-struct-0330",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-d",
        "subtopicId": "ib-d2-electric-magnetic-fields"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec7-fields-consequences",
        "subtopicId": "alevel-3-7-3-electric-fields"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-5"
      }
    ],
    "format": "structured",
    "difficulty": "higher",
    "visualFamily": "field_map",
    "stem": "Within an evacuated target chamber at a tandem accelerator, a stationary tungsten target nucleus (charge +74e) repels an incoming alpha particle (charge +2e) that momentarily comes to rest at separation 4.4 × 10⁻¹⁴ m. Take k = 8.99 × 10⁹ N m² C⁻², e = 1.60 × 10⁻¹⁹ C, and zero electric potential at infinity.",
    "workedSolution": "(a) V = kZe / r_min = 2.42 × 10⁶ V. (b) E_p = 2eV = 7.74 × 10⁻¹³ J. (c) Dividing by e = 1.60 × 10⁻¹⁹ J eV⁻¹ gives 4.84 × 10⁶ eV.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Substitutes Q = 74e and r_min = 4.4 × 10⁻¹⁴ m into V = kQ/r.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains 2.42 × 10⁶ V.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Multiplies potential from (a) by projectile charge 2e.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains 7.74 × 10⁻¹³ J.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Divides joule energy by 1.60 × 10⁻¹⁹ J eV⁻¹ (or multiplies V in volts by z).",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains 4.84 × 10⁶ eV.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "electric-potential-equipotentials",
    "familyGroupKey": "electric-potential-equipotentials::coulomb-nuclear-potential-barrier",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"500\" viewBox=\"0 0 800 500\" role=\"img\" aria-label=\"Field diagram with 2 source or marker entities\"><rect width=\"800\" height=\"500\" fill=\"white\"/><defs><marker id=\"field-arrow-sp-fields-struct-0330-figure\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker><marker id=\"field-reverse-arrow-sp-fields-struct-0330-figure\" viewBox=\"0 0 10 10\" refX=\"2\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M10 0L0 5L10 10Z\" fill=\"#59656c\"/></marker></defs><path data-path-id=\"baseline\" d=\"M107.68 233.84L706.24 233.84\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-dasharray=\"8 6\"/><path data-path-id=\"total\" d=\"M177.28 363.12L622.72 363.12\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" marker-start=\"url(#field-reverse-arrow-sp-fields-struct-0330-figure)\" marker-end=\"url(#field-arrow-sp-fields-struct-0330-figure)\"/><text x=\"400\" y=\"354.12\" text-anchor=\"middle\" font-size=\"15\" font-family=\"Arial, sans-serif\">d</text><path data-path-id=\"dimension-extension-1\" d=\"M177.28 245.96L177.28 375.24\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path data-path-id=\"dimension-extension-2\" d=\"M622.72 245.96L622.72 375.24\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><g data-entity-id=\"left-charge\"><circle cx=\"177.28\" cy=\"233.84\" r=\"18\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/><text x=\"177.28\" y=\"239.84\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">+</text><text x=\"177.28\" y=\"262.84\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">q₁</text></g><g data-entity-id=\"right-charge\"><circle cx=\"622.72\" cy=\"233.84\" r=\"18\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/><text x=\"622.72\" y=\"239.84\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">+</text><text x=\"622.72\" y=\"262.84\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">q₂</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the electric potential due to the tungsten nucleus at distance r_min.",
        "marks": 2,
        "targetQuantityKey": "potentialV",
        "expectedAnswer": "2.42 × 10⁶ V",
        "workingSteps": [
          "V = kZe / r_min = (8.99 × 10⁹ × 74 × 1.60 × 10⁻¹⁹) / (4.4 × 10⁻¹⁴).",
          "V = 2.42 × 10⁶ V."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the electrostatic potential energy (in joules) of the alpha particle at closest approach.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "barrierJ",
        "expectedAnswer": "7.74 × 10⁻¹³ J",
        "workingSteps": [
          "E_p = (+2e) V = 2 × 1.60 × 10⁻¹⁹ × 2.42 × 10⁶ V = 7.74 × 10⁻¹³ J."
        ]
      },
      {
        "partId": "c",
        "prompt": "Express this electrostatic potential energy in electronvolts (eV).",
        "marks": 2,
        "dependsOnPartIds": [
          "b"
        ],
        "targetQuantityKey": "barrierEv",
        "expectedAnswer": "4.84 × 10⁶ eV",
        "workingSteps": [
          "E_p (in eV) = E_p (in J) / (1.60 × 10⁻¹⁹ J eV⁻¹) = 4.84 × 10⁶ eV."
        ]
      }
    ]
  },
  {
    "id": "sp-mech-mcq-0216",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-a",
        "subtopicId": "ib-a2-forces-momentum"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec4-mechanics-materials",
        "subtopicId": "alevel-3-4-1-force-energy-momentum"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S1",
        "topicId": "ncuk-ac2",
        "subtopicId": "ncuk-ac2-6"
      }
    ],
    "format": "mcq",
    "difficulty": "standard",
    "visualFamily": "mechanics_scene",
    "stem": "On a precision gas-bearing trough, lighter rider X of mass 1 kg moving right at 7 m s⁻¹ strikes stationary heavier rider Y of mass 3.2 kg, causing rider Y to move right at 2.82 m s⁻¹ while rider X rebounds to the left. How much kinetic energy is dissipated in this rebound collision?",
    "workedSolution": "Taking rightward positive, (1)(7) = (1)v_X + (3.2)(2.82) gives v_X = -2.02 m s⁻¹ (2.02 m s⁻¹ to the left). Scalar final kinetic energies add: K_f = ½(1)(2.02)² + ½(3.2)(2.82)² = 14.8 J. Energy lost = 24.5 J − K_f = 9.73 J. Target = 9.73 J.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Finds rebound speed 2.02 m s⁻¹ and sums scalar kinetic energies to obtain 9.73 J (B).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "linear-momentum-impulse",
    "familyGroupKey": "linear-momentum-impulse::coalescing-and-rebound-collision-energetics",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"620\" height=\"430\" viewBox=\"0 0 620 430\" role=\"img\"><title>Mechanics diagram</title><desc>X, 1 kg; Y, 3.2 kg; 7 m s⁻¹</desc><defs><marker id=\"mechanics-arrow-sp-mech-mcq-0216-figure\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\"/></marker></defs><g font-family=\"Arial, sans-serif\" font-size=\"15\"><polyline points=\"158.8,262.6 461.2,262.6\" fill=\"none\" stroke=\"#202020\" stroke-width=\"2\"/><g transform=\"translate(230.8 241) rotate(0)\"><rect x=\"-19\" y=\"-13\" width=\"38\" height=\"26\" fill=\"white\" stroke=\"#202020\" stroke-width=\"2\"/><circle cx=\"-12\" cy=\"17\" r=\"4\"/><circle cx=\"12\" cy=\"17\" r=\"4\"/></g><text x=\"230.8\" y=\"216\" text-anchor=\"middle\">X, 1 kg</text><g transform=\"translate(392.8 241) rotate(0)\"><rect x=\"-19\" y=\"-13\" width=\"38\" height=\"26\" fill=\"white\" stroke=\"#202020\" stroke-width=\"2\"/><circle cx=\"-12\" cy=\"17\" r=\"4\"/><circle cx=\"12\" cy=\"17\" r=\"4\"/></g><text x=\"392.8\" y=\"216\" text-anchor=\"middle\">Y, 3.2 kg</text><line x1=\"230.8\" y1=\"241\" x2=\"313.6\" y2=\"241\" stroke=\"#202020\" stroke-width=\"2\" marker-end=\"url(#mechanics-arrow-sp-mech-mcq-0216-figure)\"/><text x=\"313.6\" y=\"229\" text-anchor=\"middle\">7 m s⁻¹</text><text x=\"310\" y=\"418\" text-anchor=\"middle\" font-size=\"12\">Diagrams not to scale</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "13.8 J",
        "isCorrect": false,
        "distractorRationale": "Treats the rebounding kinetic energy of X as negative because v_X < 0, subtracting ½m_X v_X² instead of adding scalar kinetic energies."
      },
      {
        "label": "B",
        "text": "9.73 J",
        "isCorrect": true
      },
      {
        "label": "C",
        "text": "11.8 J",
        "isCorrect": false,
        "distractorRationale": "Ignores the rebound kinetic energy of X completely after impact."
      },
      {
        "label": "D",
        "text": "14.8 J",
        "isCorrect": false,
        "distractorRationale": "Reports total post-collision kinetic energy instead of kinetic energy lost."
      }
    ],
    "correctOptionIndex": 1
  },
  {
    "id": "waves-malus-polarization-structured-305",
    "syllabi": [
      {
        "syllabus": "alevel",
        "level": "Y12",
        "topicId": "alevel-sec3-waves",
        "subtopicId": "alevel-3-3-1-progressive-stationary-waves"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac6",
        "subtopicId": "ncuk-ac6-2"
      }
    ],
    "format": "structured",
    "difficulty": "standard",
    "visualFamily": "waves",
    "stem": "On a photographic filter-transmission test bench with high-extinction linear polarizers, a vertically plane-polarized beam of intensity 240 W m⁻² is incident normally on an ideal linear analyzer whose transmission axis makes an angle θ = 30° with the vertical (for plane-polarized light, Malus's law gives transmitted intensity I = I₀ cos²θ).",
    "workedSolution": "(a) E / E₀ = cos(30°) = 0.866. (b) I = I₀ cos²(30°) = 180 W m⁻². (c) Absorbed intensity = 240 − 180 = 60.0 W m⁻².",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Projects electric-field vector via E / E₀ = cos θ.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains 0.866.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Applies I = I₀ cos²θ.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains I = 180 W m⁻².",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Subtracts transmitted intensity from incident intensity.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains 60.0 W m⁻².",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "progressive-waves-polarization",
    "familyGroupKey": "progressive-waves-polarization::malus-polarized-analyzer-transmission",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"680\" height=\"420\" viewBox=\"0 0 680 420\" role=\"img\" aria-label=\"Malus&apos;s law polarization diagram\"><title>Malus&apos;s law polarization diagram</title><desc>I₀ = 240 W m⁻²; I; θ</desc><defs><marker id=\"waves-arrow-waves-malus-polarization-structu\" viewBox=\"0 0 10 10\" refX=\"8.5\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0.5 L 10 5 L 0 9.5 z\" fill=\"#1f2937\"/></marker></defs><rect x=\"0\" y=\"0\" width=\"680\" height=\"420\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\" font-size=\"13\"><line x1=\"42\" y1=\"227\" x2=\"360\" y2=\"227\" stroke=\"#6b7280\" stroke-width=\"1.5\" stroke-dasharray=\"5 4\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><line x1=\"82\" y1=\"189\" x2=\"82\" y2=\"265\" stroke=\"#2563eb\" stroke-width=\"2\" marker-start=\"url(#waves-arrow-waves-malus-polarization-structu)\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><line x1=\"122\" y1=\"189\" x2=\"122\" y2=\"265\" stroke=\"#2563eb\" stroke-width=\"2\" marker-start=\"url(#waves-arrow-waves-malus-polarization-structu)\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><text x=\"90\" y=\"171\" text-anchor=\"middle\" font-size=\"12.5\" font-weight=\"600\" fill=\"#1d4ed8\">I₀ = 240 W m⁻²</text><ellipse cx=\"196\" cy=\"227\" rx=\"16\" ry=\"54\" fill=\"#fef2f2\" stroke=\"#991b1b\" stroke-width=\"2\"/><line x1=\"191\" y1=\"263.3731\" x2=\"201\" y2=\"190.6269\" stroke=\"#b91c1c\" stroke-width=\"2\"/><text x=\"196\" y=\"299\" text-anchor=\"middle\" font-size=\"12\" font-weight=\"600\" fill=\"#991b1b\">Analyzer A</text><line x1=\"278\" y1=\"194.091\" x2=\"278\" y2=\"259.909\" stroke=\"#059669\" stroke-width=\"2.2\" marker-start=\"url(#waves-arrow-waves-malus-polarization-structu)\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><text x=\"278\" y=\"171\" text-anchor=\"middle\" font-size=\"12.5\" font-weight=\"600\" fill=\"#065f46\">I</text><circle cx=\"532\" cy=\"227\" r=\"92\" fill=\"#f9fafb\" stroke=\"#d1d5db\" stroke-width=\"1.4\"/><text x=\"532\" y=\"119\" text-anchor=\"middle\" font-size=\"12\" font-weight=\"600\" fill=\"#374151\">Front view (along beam)</text><line x1=\"532\" y1=\"227\" x2=\"532\" y2=\"135\" stroke=\"#2563eb\" stroke-width=\"2.2\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><text x=\"522\" y=\"147\" text-anchor=\"end\" font-size=\"12\" font-weight=\"600\" fill=\"#1d4ed8\">E₀</text><line x1=\"486\" y1=\"306.6743\" x2=\"578\" y2=\"147.3257\" stroke=\"#b91c1c\" stroke-width=\"1.6\" stroke-dasharray=\"5 3\"/><line x1=\"532\" y1=\"135\" x2=\"571.8372\" y2=\"158\" stroke=\"#6b7280\" stroke-width=\"1.2\" stroke-dasharray=\"3 3\"/><line x1=\"532\" y1=\"227\" x2=\"571.8372\" y2=\"158\" stroke=\"#059669\" stroke-width=\"2.6\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><text x=\"581.8372\" y=\"162\" text-anchor=\"start\" font-size=\"12\" font-weight=\"700\" fill=\"#065f46\">E</text><path d=\"M 532 189 A 38 38 0 0 1 551 194.091\" fill=\"none\" stroke=\"#991b1b\" stroke-width=\"1.5\"/><text x=\"549.4586\" y=\"176.7719\" text-anchor=\"start\" font-size=\"12\" font-weight=\"600\" fill=\"#991b1b\">θ</text><text x=\"664\" y=\"408\" text-anchor=\"end\" font-size=\"11\" fill=\"#6b7280\">Diagram not to scale</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the ratio E / E₀ of the transmitted electric-field amplitude to the incident electric-field amplitude.",
        "marks": 2,
        "targetQuantityKey": "amplitudeTransmissionFactor",
        "expectedAnswer": "0.866",
        "workingSteps": [
          "Only the electric-field component parallel to the analyzer axis is transmitted: E / E₀ = cos θ.",
          "cos(30°) = 0.866."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the intensity I of the beam emerging from the analyzer.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "transmittedIntensityWm2",
        "expectedAnswer": "180 W m⁻²",
        "workingSteps": [
          "Use I = I₀ cos²θ.",
          "I = 240 × cos²(30°) = 180 W m⁻²."
        ]
      },
      {
        "partId": "c",
        "prompt": "Determine the intensity removed (absorbed or rejected) from the beam by the analyzer.",
        "marks": 2,
        "dependsOnPartIds": [
          "b"
        ],
        "targetQuantityKey": "absorbedIntensityAtAnalyzerWm2",
        "expectedAnswer": "60.0 W m⁻²",
        "workingSteps": [
          "I_abs = I₀ − I.",
          "I_abs = 240 − 180 = 60.0 W m⁻²."
        ]
      }
    ]
  },
  {
    "id": "sp-optics-shm-mcq-0223",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-c",
        "subtopicId": "ib-c1-shm"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec6-further-mechanics-thermal",
        "subtopicId": "alevel-3-6-1-periodic-motion-shm"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac6",
        "subtopicId": "ncuk-ac6-1"
      }
    ],
    "format": "mcq",
    "difficulty": "higher",
    "visualFamily": "optics-shm",
    "stem": "The velocity–displacement phase portrait shown represents an ultrasonic surgical transducer tip oscillating with ω = 30 rad s⁻¹ and x₀ = 0.1 m. Find the oscillator's speed at x = 0.028 m.",
    "workedSolution": "Using v = ω√(x₀² − x²) gives v = 30 × √(0.1² − 0.028²) = 2.88 m s⁻¹.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Substitutes into v = ω√(x₀² − x²) to obtain 2.88 m s⁻¹ (B).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "simple-harmonic-motion",
    "familyGroupKey": "simple-harmonic-motion::shm-velocity-displacement-phase-ellipse",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"680\" height=\"400\" viewBox=\"0 0 680 400\" role=\"img\" aria-label=\"Simple harmonic motion graph\"><title>Simple harmonic motion graph</title><desc>Simple harmonic motion kinematic and energy curves</desc><rect width=\"680\" height=\"400\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\"><rect x=\"80\" y=\"46\" width=\"550\" height=\"296\" fill=\"#ffffff\" stroke=\"#cbd5e1\" stroke-width=\"1.2\"/><line x1=\"88\" y1=\"194\" x2=\"622\" y2=\"194\" stroke=\"#64748b\" stroke-width=\"1.3\"/><line x1=\"355\" y1=\"54\" x2=\"355\" y2=\"334\" stroke=\"#64748b\" stroke-width=\"1.3\"/><text x=\"575\" y=\"210\" text-anchor=\"middle\" font-size=\"10.5\" fill=\"#475569\">+0.1</text><text x=\"135\" y=\"210\" text-anchor=\"middle\" font-size=\"10.5\" fill=\"#475569\">−0.1</text><text x=\"620\" y=\"188\" text-anchor=\"end\" font-size=\"11.5\" font-weight=\"600\" fill=\"#1e293b\">x / m</text><ellipse cx=\"355\" cy=\"194\" rx=\"220\" ry=\"115.44\" fill=\"none\" stroke=\"#0f172a\" stroke-width=\"2.3\"/><polygon points=\"360,78.56 351,74.56 351,82.56\" fill=\"#0f172a\"/><polygon points=\"350,309.44 359,305.44 359,313.44\" fill=\"#0f172a\"/><text x=\"363\" y=\"72.56\" font-size=\"10.5\" fill=\"#475569\">+v_max</text><text x=\"363\" y=\"323.44\" font-size=\"10.5\" fill=\"#475569\">−v_max</text><text x=\"363\" y=\"64\" font-size=\"11.5\" font-weight=\"600\" fill=\"#0f172a\">v</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "3.00 m s⁻¹",
        "isCorrect": false,
        "distractorRationale": "Calculates the maximum speed ωx₀ at equilibrium (x = 0) instead of the speed at x."
      },
      {
        "label": "B",
        "text": "2.88 m s⁻¹",
        "isCorrect": true
      },
      {
        "label": "C",
        "text": "2.16 m s⁻¹",
        "isCorrect": false,
        "distractorRationale": "Evaluates ω(x₀ − x) linearly instead of taking √(x₀² − x²)."
      },
      {
        "label": "D",
        "text": "0.840 m s⁻¹",
        "isCorrect": false,
        "distractorRationale": "Uses ωx instead of ω√(x₀² − x²), mistakenly assuming speed is directly proportional to displacement."
      }
    ],
    "correctOptionIndex": 1
  },
  {
    "id": "sp-thermal-struct-0205",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-b",
        "subtopicId": "ib-b1-thermal-energy-transfers"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec6-further-mechanics-thermal",
        "subtopicId": "alevel-3-6-2-thermal-physics"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac3",
        "subtopicId": "ncuk-ac3-3"
      }
    ],
    "format": "structured",
    "difficulty": "foundation",
    "visualFamily": "thermal",
    "stem": "Inside a thick-walled cork-lagged enthalpy cell, a copper calorimeter vessel of mass 0.16 kg (c_cup = 385 J kg⁻¹ K⁻¹) holds 0.55 kg of water (c_liq = 4180 J kg⁻¹ K⁻¹), both initially at 294 K. A 0.28 kg iron block (c_s = 450 J kg⁻¹ K⁻¹) at 440 K is lowered into the bath; heat loss to the outside air is negligible.",
    "workedSolution": "(a) Solving the enthalpy balance yields T_eq = 301 K. (b) Heat released by the hot solid Q_lost = m_s c_s (T_s − T_eq) = 1.75 × 10⁴ J. (c) Heat gained by the water Q_liq = m_l c_liq (T_eq − T_l) = 1.70 × 10⁴ J.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Sets up full calorimetry heat-balance equation.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains 301 K.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Evaluates m_s c_s (T_s − T_eq).",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains 1.75 × 10⁴ J.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Evaluates m_l c_liq (T_eq − T_l).",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains 1.70 × 10⁴ J.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "specific-heat-latent-heat",
    "familyGroupKey": "specific-heat-latent-heat::calorimetry-solid-liquid-equilibrium",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"500\" viewBox=\"0 0 720 500\" role=\"img\" aria-label=\"Insulated calorimeter thermal equilibrium diagram\"><title>Insulated calorimeter thermal equilibrium diagram</title><desc>Insulated calorimeter thermal equilibrium diagram</desc><rect width=\"720\" height=\"500\" fill=\"white\"/><rect x=\"104\" y=\"92\" width=\"210\" height=\"290\" rx=\"6\" fill=\"#eceff2\" stroke=\"#202429\" stroke-width=\"2\"/><rect x=\"96\" y=\"78\" width=\"226\" height=\"14\" rx=\"3\" fill=\"#d9dfe5\" stroke=\"#202429\" stroke-width=\"1.8\"/><rect x=\"118\" y=\"106\" width=\"182\" height=\"262\" fill=\"white\" stroke=\"#202429\" stroke-width=\"1.6\"/><rect x=\"119\" y=\"174\" width=\"180\" height=\"193\" fill=\"#e3eef8\"/><line x1=\"119\" y1=\"174\" x2=\"299\" y2=\"174\" stroke=\"#3b5b78\" stroke-width=\"1.6\" stroke-dasharray=\"6 3\"/><rect x=\"169\" y=\"42\" width=\"8\" height=\"250\" rx=\"3\" fill=\"white\" stroke=\"#202429\" stroke-width=\"1.6\"/><circle cx=\"173\" cy=\"296\" r=\"7.5\" fill=\"#4f5962\" stroke=\"#202429\" stroke-width=\"1.6\"/><line x1=\"173\" y1=\"98\" x2=\"173\" y2=\"292\" stroke=\"#4f5962\" stroke-width=\"2.4\"/><line x1=\"253\" y1=\"48\" x2=\"253\" y2=\"309\" stroke=\"#202429\" stroke-width=\"2\"/><ellipse cx=\"253\" cy=\"312\" rx=\"14\" ry=\"4.5\" fill=\"none\" stroke=\"#202429\" stroke-width=\"2\"/><rect x=\"169\" y=\"304\" width=\"56\" height=\"42\" rx=\"4\" fill=\"#cfd6dd\" stroke=\"#202429\" stroke-width=\"1.8\"/><line x1=\"197\" y1=\"300\" x2=\"197\" y2=\"272\" stroke=\"#202429\" stroke-width=\"1.6\"/><polygon points=\"197,267 200.4,276.25 193.6,276.25\" fill=\"#202429\"/><text x=\"209\" y=\"408\" text-anchor=\"middle\" font-size=\"14\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">insulated calorimeter</text><rect x=\"389\" y=\"66\" width=\"299\" height=\"64\" rx=\"6\" fill=\"#f8fafc\" stroke=\"#c5cdd5\" stroke-width=\"1.3\"/><text x=\"403\" y=\"90\" font-size=\"14.5\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Iron specimen</text><text x=\"403\" y=\"113\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">m = 0.28 kg  |  T_i = 440 K  |  c = 450 J kg⁻¹ K⁻¹</text><rect x=\"389\" y=\"144\" width=\"299\" height=\"64\" rx=\"6\" fill=\"#f8fafc\" stroke=\"#c5cdd5\" stroke-width=\"1.3\"/><text x=\"403\" y=\"168\" font-size=\"14.5\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Water bath</text><text x=\"403\" y=\"191\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">m = 0.55 kg  |  T_i = 294 K  |  c = 4180 J kg⁻¹ K⁻¹</text><rect x=\"389\" y=\"222\" width=\"299\" height=\"64\" rx=\"6\" fill=\"#f8fafc\" stroke=\"#c5cdd5\" stroke-width=\"1.3\"/><text x=\"403\" y=\"246\" font-size=\"14.5\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Copper vessel</text><text x=\"403\" y=\"269\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">m = 0.16 kg  |  T_i = 294 K  |  c = 385 J kg⁻¹ K⁻¹</text><rect x=\"389\" y=\"306\" width=\"299\" height=\"48\" rx=\"6\" fill=\"#eef3f8\" stroke=\"#8a99a8\" stroke-width=\"1.4\"/><text x=\"403\" y=\"335\" font-size=\"14\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Thermal equilibrium: T_eq</text></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the final thermal equilibrium temperature T_eq of the system.",
        "marks": 2,
        "targetQuantityKey": "equilibriumTemperatureK",
        "expectedAnswer": "301 K",
        "workingSteps": [
          "m_s c_s (440 − T_eq) = (m_l c_liq + m_cup c_cup)(T_eq − 294).",
          "Solving for T_eq gives 301 K."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the thermal energy released by the iron block.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "heatLostByHotJ",
        "expectedAnswer": "1.75 × 10⁴ J",
        "workingSteps": [
          "Q_lost = m_s c_s (440 − T_eq) = 1.75 × 10⁴ J."
        ]
      },
      {
        "partId": "c",
        "prompt": "Determine the thermal energy absorbed specifically by the water.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "component:liquid:signedHeatJ",
        "expectedAnswer": "1.70 × 10⁴ J",
        "workingSteps": [
          "Q_liq = m_l c_liq (T_eq − 294) = 1.70 × 10⁴ J."
        ]
      }
    ]
  },
  {
    "id": "sp-pure-calc-0002",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-tools",
        "subtopicId": "ib-tools-measurement-uncertainties"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec1-measurements-errors",
        "subtopicId": "alevel-3-1-si-uncertainties-estimation"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac1",
        "subtopicId": "ncuk-ac1-1"
      }
    ],
    "format": "mcq",
    "difficulty": "standard",
    "visualFamily": "none",
    "stem": "During quality inspection of a syntactic-foam subsea buoyancy block, a technician measures the cubic specimen to have edge length 3.2 cm ± 0.04 cm and mass 147 g ± 1.5 g. What is the percentage uncertainty in the calculated density of the cube?",
    "workedSolution": "Since ρ = m L⁻³, Δρ / ρ = Δm / m + 3(ΔL / L) = (1.5/147) + 3(0.04/3.2). Expressing as a percentage gives 4.77%.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Applies Δρ/ρ = Δm/m + 3(ΔL/L) to obtain 4.77%.",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "si-units-dimensional-analysis",
    "familyGroupKey": "si-units-dimensional-analysis::si-cubed-prefix-bulk-density",
    "options": [
      {
        "label": "A",
        "text": "2.27%",
        "isCorrect": false,
        "distractorRationale": "Adds the percentage uncertainty in edge length once instead of multiplying it by the power exponent 3 for L³."
      },
      {
        "label": "B",
        "text": "4.77%",
        "isCorrect": true
      },
      {
        "label": "C",
        "text": "2.73%",
        "isCorrect": false,
        "distractorRationale": "Subtracts percentage uncertainties in the quotient m / L³ instead of adding worst-case contributions."
      },
      {
        "label": "D",
        "text": "2.97%",
        "isCorrect": false,
        "distractorRationale": "Cubes the percentage uncertainty in L rather than multiplying the fractional uncertainty by 3."
      }
    ],
    "correctOptionIndex": 1
  }
];

export const SEED_FALLBACK_CHUNK_BY_ID: Readonly<Record<string, PhysicsDomainId>> = {
  "sp-v2-graphs-mcq-0081": "graphs",
  "sp-circuits-11-structured-235": "circuits",
  "sp-fields-mcq-0071": "fields",
  "sp-mech-structured-0057": "mechanics",
  "sp-v2-waves-mcq-0127": "waves",
  "sp-optics-shm-struct-0110": "optics-shm",
  "sp-thermal-mcq-0030": "thermal",
  "ga-circular-orbit-energy-str-104": "grav-astro",
  "sp-v2-em-induction-mcq-0095": "em-induction",
  "sp-qn-structured-251": "quantum-nuclear",
  "sp-v3-ncuk-ac4-ivcurve-09": "graphs",
  "sp-v2-circuits-mcq-0090": "circuits",
  "sp-fields-struct-0330": "fields",
  "sp-mech-mcq-0216": "mechanics",
  "waves-malus-polarization-structured-305": "waves",
  "sp-optics-shm-mcq-0223": "optics-shm",
  "sp-thermal-struct-0205": "thermal",
  "sp-pure-calc-0002": "pure-calculation"
};

export const SEED_FALLBACK_MANIFEST: PublicBankManifest = {
  "schemaVersion": "sixthphysics-public-manifest/1.0.0",
  "generatedAt": "2026-11-17T23:21:18.834Z",
  "totalItems": 18,
  "syllabi": {
    "ib": {
      "syllabus": "ib",
      "title": "IB Diploma Programme Physics (SL & HL)",
      "shortLabel": "IB Physics",
      "specificationCode": "IB-DP-PHYSICS-2025",
      "levels": [
        "SL",
        "HL"
      ],
      "gravityConvention": "g = 9.8 m s⁻²",
      "questionCount": 16,
      "mcqCount": 9,
      "structuredCount": 7,
      "countsByLevel": {
        "SL": 6,
        "HL": 10
      },
      "topics": [
        {
          "id": "ib-tools",
          "code": "Tools",
          "title": "Tools for Physics: Measurement, Uncertainties and Graphical Analysis",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 1,
          "mcqCount": 1,
          "structuredCount": 0,
          "countsByLevel": {
            "SL": 0,
            "HL": 1
          },
          "subtopics": [
            {
              "id": "ib-tools-measurement-uncertainties",
              "code": "T.1-T.3",
              "title": "SI Units, Uncertainties, Error Bars and Linearization",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 1
              }
            }
          ]
        },
        {
          "id": "ib-theme-a",
          "code": "Theme A",
          "title": "Space, time and motion",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 3,
          "mcqCount": 2,
          "structuredCount": 1,
          "countsByLevel": {
            "SL": 2,
            "HL": 1
          },
          "subtopics": [
            {
              "id": "ib-a1-kinematics",
              "code": "A.1",
              "title": "Kinematics",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-a2-forces-momentum",
              "code": "A.2",
              "title": "Forces and momentum",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 3,
              "mcqCount": 2,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 2,
                "HL": 1
              }
            },
            {
              "id": "ib-a3-work-energy-power",
              "code": "A.3",
              "title": "Work, energy and power",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-a4-rigid-body-mechanics",
              "code": "A.4",
              "title": "Rigid body mechanics (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-a5-galilean-special-relativity",
              "code": "A.5",
              "title": "Galilean and special relativity (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            }
          ]
        },
        {
          "id": "ib-theme-b",
          "code": "Theme B",
          "title": "The particulate nature of matter",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "SL": 2,
            "HL": 2
          },
          "subtopics": [
            {
              "id": "ib-b1-thermal-energy-transfers",
              "code": "B.1",
              "title": "Thermal energy transfers",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 2,
                "HL": 0
              }
            },
            {
              "id": "ib-b2-greenhouse-effect",
              "code": "B.2",
              "title": "Greenhouse effect",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-b3-gas-laws",
              "code": "B.3",
              "title": "Gas laws",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-b4-thermodynamics",
              "code": "B.4",
              "title": "Thermodynamics (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-b5-current-circuits",
              "code": "B.5",
              "title": "Current and circuits",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 0,
                "HL": 2
              }
            }
          ]
        },
        {
          "id": "ib-theme-c",
          "code": "Theme C",
          "title": "Wave behaviour",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 3,
          "mcqCount": 2,
          "structuredCount": 1,
          "countsByLevel": {
            "SL": 0,
            "HL": 3
          },
          "subtopics": [
            {
              "id": "ib-c1-shm",
              "code": "C.1",
              "title": "Simple harmonic motion",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 0,
                "HL": 2
              }
            },
            {
              "id": "ib-c2-wave-model",
              "code": "C.2",
              "title": "Wave model",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-c3-wave-phenomena",
              "code": "C.3",
              "title": "Wave phenomena",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 1
              }
            },
            {
              "id": "ib-c4-standing-waves-resonance",
              "code": "C.4",
              "title": "Standing waves and resonance",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-c5-doppler-effect",
              "code": "C.5",
              "title": "Doppler effect",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            }
          ]
        },
        {
          "id": "ib-theme-d",
          "code": "Theme D",
          "title": "Fields",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "SL": 1,
            "HL": 3
          },
          "subtopics": [
            {
              "id": "ib-d1-gravitational-fields",
              "code": "D.1",
              "title": "Gravitational fields",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 1,
                "HL": 0
              }
            },
            {
              "id": "ib-d2-electric-magnetic-fields",
              "code": "D.2",
              "title": "Electric and magnetic fields",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 0,
                "HL": 2
              }
            },
            {
              "id": "ib-d3-motion-em-fields",
              "code": "D.3",
              "title": "Motion in electromagnetic fields",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-d4-induction",
              "code": "D.4",
              "title": "Induction (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 1
              }
            }
          ]
        },
        {
          "id": "ib-theme-e",
          "code": "Theme E",
          "title": "Nuclear and quantum physics",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 1,
          "mcqCount": 0,
          "structuredCount": 1,
          "countsByLevel": {
            "SL": 1,
            "HL": 0
          },
          "subtopics": [
            {
              "id": "ib-e1-structure-atom",
              "code": "E.1",
              "title": "Structure of the atom",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-e2-quantum-physics",
              "code": "E.2",
              "title": "Quantum physics (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-e3-radioactive-decay",
              "code": "E.3",
              "title": "Radioactive decay",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-e4-fission",
              "code": "E.4",
              "title": "Fission",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 1,
                "HL": 0
              }
            },
            {
              "id": "ib-e5-fusion-stars",
              "code": "E.5",
              "title": "Fusion and stars",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            }
          ]
        }
      ]
    },
    "alevel": {
      "syllabus": "alevel",
      "title": "UK GCE AS & A-Level Physics (DfE Core + AQA 7407/7408)",
      "shortLabel": "UK A-Level",
      "specificationCode": "AQA-7407-7408",
      "levels": [
        "Y12",
        "Y13"
      ],
      "gravityConvention": "g = 9.81 m s⁻²",
      "questionCount": 18,
      "mcqCount": 9,
      "structuredCount": 9,
      "countsByLevel": {
        "Y12": 9,
        "Y13": 18
      },
      "topics": [
        {
          "id": "alevel-sec1-measurements-errors",
          "code": "Section 1 (3.1)",
          "title": "Measurements and their errors",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 1,
          "mcqCount": 1,
          "structuredCount": 0,
          "countsByLevel": {
            "Y12": 1,
            "Y13": 1
          },
          "subtopics": [
            {
              "id": "alevel-3-1-si-uncertainties-estimation",
              "code": "3.1.1-3.1.3",
              "title": "SI Units, Uncertainties and Order-of-Magnitude Estimation",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 1,
                "Y13": 1
              }
            }
          ]
        },
        {
          "id": "alevel-sec2-particles-radiation",
          "code": "Section 2 (3.2)",
          "title": "Particles and radiation",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 0,
          "mcqCount": 0,
          "structuredCount": 0,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 0
          },
          "subtopics": [
            {
              "id": "alevel-3-2-1-particles-quarks",
              "code": "3.2.1",
              "title": "Constituents of the Atom, Antiparticles, Hadrons, Leptons and Quarks",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              }
            },
            {
              "id": "alevel-3-2-2-quantum-phenomena",
              "code": "3.2.2",
              "title": "Photoelectric Effect, Atomic Energy Levels and Wave-Particle Duality",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              }
            }
          ]
        },
        {
          "id": "alevel-sec3-waves",
          "code": "Section 3 (3.3)",
          "title": "Waves",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 2,
          "mcqCount": 1,
          "structuredCount": 1,
          "countsByLevel": {
            "Y12": 2,
            "Y13": 2
          },
          "subtopics": [
            {
              "id": "alevel-3-3-1-progressive-stationary-waves",
              "code": "3.3.1",
              "title": "Progressive Waves, Polarisation and Stationary Waves",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 1,
                "Y13": 1
              }
            },
            {
              "id": "alevel-3-3-2-refraction-diffraction-interference",
              "code": "3.3.2",
              "title": "Interference, Diffraction Gratings, Refraction and Optical Fibres",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 1,
                "Y13": 1
              }
            }
          ]
        },
        {
          "id": "alevel-sec4-mechanics-materials",
          "code": "Section 4 (3.4)",
          "title": "Mechanics and materials",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 3,
          "mcqCount": 2,
          "structuredCount": 1,
          "countsByLevel": {
            "Y12": 3,
            "Y13": 3
          },
          "subtopics": [
            {
              "id": "alevel-3-4-1-force-energy-momentum",
              "code": "3.4.1",
              "title": "Force, Moments, Kinematics, Projectile Motion, Momentum and Energy",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 3,
              "mcqCount": 2,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 3,
                "Y13": 3
              }
            },
            {
              "id": "alevel-3-4-2-materials-young-modulus",
              "code": "3.4.2",
              "title": "Bulk Properties of Solids, Hooke Law and the Young Modulus",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              }
            }
          ]
        },
        {
          "id": "alevel-sec5-electricity",
          "code": "Section 5 (3.5)",
          "title": "Electricity",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 3,
          "mcqCount": 1,
          "structuredCount": 2,
          "countsByLevel": {
            "Y12": 3,
            "Y13": 3
          },
          "subtopics": [
            {
              "id": "alevel-3-5-1-current-electricity",
              "code": "3.5.1",
              "title": "Current Electricity, Resistivity, DC Networks, Potential Dividers & Internal Resistance",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 3,
              "mcqCount": 1,
              "structuredCount": 2,
              "countsByLevel": {
                "Y12": 3,
                "Y13": 3
              }
            }
          ]
        },
        {
          "id": "alevel-sec6-further-mechanics-thermal",
          "code": "Section 6 (3.6)",
          "title": "Further mechanics and thermal physics (A-Level / Year 13 only)",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y13"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 4
          },
          "subtopics": [
            {
              "id": "alevel-3-6-1-periodic-motion-shm",
              "code": "3.6.1",
              "title": "Circular Motion, Simple Harmonic Motion, Resonance and Damping",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 2
              }
            },
            {
              "id": "alevel-3-6-2-thermal-physics",
              "code": "3.6.2",
              "title": "Thermal Energy Transfer, Ideal Gases and Kinetic Theory",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 2
              }
            }
          ]
        },
        {
          "id": "alevel-sec7-fields-consequences",
          "code": "Section 7 (3.7)",
          "title": "Fields and their consequences (A-Level / Year 13 only)",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y13"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 4
          },
          "subtopics": [
            {
              "id": "alevel-3-7-2-gravitational-fields",
              "code": "3.7.1-3.7.2",
              "title": "Gravitational Fields, Potential and Satellite Orbits",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 1
              }
            },
            {
              "id": "alevel-3-7-3-electric-fields",
              "code": "3.7.3",
              "title": "Electric Fields, Coulomb Law and Electric Potential",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 2
              }
            },
            {
              "id": "alevel-3-7-4-capacitance",
              "code": "3.7.4",
              "title": "Capacitance, Dielectrics, Stored Energy and RC Exponential Circuits",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              }
            },
            {
              "id": "alevel-3-7-5-magnetic-fields-induction-ac",
              "code": "3.7.5",
              "title": "Magnetic Fields, Electromagnetic Induction, AC RMS and Transformers",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 1
              }
            }
          ]
        },
        {
          "id": "alevel-sec8-nuclear-physics",
          "code": "Section 8 (3.8)",
          "title": "Nuclear physics (A-Level / Year 13 only)",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y13"
          ],
          "questionCount": 1,
          "mcqCount": 0,
          "structuredCount": 1,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 1
          },
          "subtopics": [
            {
              "id": "alevel-3-8-nuclear-decay-energy",
              "code": "3.8.1-3.8.6",
              "title": "Nuclear Radius, Exponential Radioactive Decay, Mass Defect, Fission & Fusion",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 1
              }
            }
          ]
        },
        {
          "id": "alevel-options-9-13",
          "code": "Sections 9-13 (Options)",
          "title": "Year 13 Optional Modules (Astrophysics, Medical, Engineering, Turning Points, Electronics)",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y13"
          ],
          "questionCount": 0,
          "mcqCount": 0,
          "structuredCount": 0,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 0
          },
          "subtopics": [
            {
              "id": "alevel-3-9-astrophysics",
              "code": "3.9",
              "title": "Option: Astrophysics (Telescopes, Thin Lenses, Stars & Cosmology)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            },
            {
              "id": "alevel-3-10-medical-physics",
              "code": "3.10",
              "title": "Option: Medical Physics (Eye Optics, Ultrasound & X-Ray Attenuation)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            },
            {
              "id": "alevel-3-11-engineering-physics",
              "code": "3.11",
              "title": "Option: Engineering Physics (Rotational Dynamics & Thermodynamic Cycles)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            },
            {
              "id": "alevel-3-12-turning-points",
              "code": "3.12",
              "title": "Option: Turning Points in Physics (Electron Discovery & Special Relativity)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            },
            {
              "id": "alevel-3-13-electronics",
              "code": "3.13",
              "title": "Option: Electronics (Operational Amplifiers, Timing & Digital Logic)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            }
          ],
          "isOption": true
        }
      ]
    },
    "ncuk": {
      "syllabus": "ncuk",
      "title": "NCUK International Foundation Year (IFY) Physics",
      "shortLabel": "NCUK IFY",
      "specificationCode": "IFYPH005",
      "levels": [
        "IFY",
        "IFY-S1",
        "IFY-S2"
      ],
      "gravityConvention": "g = 9.81 m s⁻²",
      "questionCount": 18,
      "mcqCount": 9,
      "structuredCount": 9,
      "countsByLevel": {
        "IFY": 18,
        "IFY-S1": 9,
        "IFY-S2": 9
      },
      "topics": [
        {
          "id": "ncuk-ac1",
          "code": "AC1 / LO1",
          "title": "Units, Uncertainties, Graphical Analysis and Vectors",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S1",
            "IFY"
          ],
          "questionCount": 1,
          "mcqCount": 1,
          "structuredCount": 0,
          "countsByLevel": {
            "IFY": 1,
            "IFY-S1": 1,
            "IFY-S2": 0
          },
          "subtopics": [
            {
              "id": "ncuk-ac1-1",
              "code": "AC1.1",
              "title": "Quantities, SI Units, Precision and Uncertainty Propagation",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 1,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac1-2",
              "code": "AC1.2",
              "title": "Data Tables, Graph Plotting and Line of Worst Fit",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac1-3",
              "code": "AC1.3",
              "title": "Scalars and Vectors",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac2",
          "code": "AC2 / LO2",
          "title": "Mechanics",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S1",
            "IFY"
          ],
          "questionCount": 3,
          "mcqCount": 2,
          "structuredCount": 1,
          "countsByLevel": {
            "IFY": 3,
            "IFY-S1": 3,
            "IFY-S2": 0
          },
          "subtopics": [
            {
              "id": "ncuk-ac2-1",
              "code": "AC2.1",
              "title": "Kinematics and Projectile Motion",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-2",
              "code": "AC2.2",
              "title": "Dynamics, Newton's Laws and Terminal Velocity",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-3",
              "code": "AC2.3",
              "title": "Statics, Moments, Couples and Torque",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-4",
              "code": "AC2.4",
              "title": "Circular Motion",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-5",
              "code": "AC2.5",
              "title": "Energy, Work Done, Power and Efficiency",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-6",
              "code": "AC2.6",
              "title": "Linear Momentum, Impulse and Collisions",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 3,
              "mcqCount": 2,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 3,
                "IFY-S1": 3,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac3",
          "code": "AC3 / LO3",
          "title": "Materials and Thermal Physics",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S1",
            "IFY"
          ],
          "questionCount": 2,
          "mcqCount": 1,
          "structuredCount": 1,
          "countsByLevel": {
            "IFY": 2,
            "IFY-S1": 2,
            "IFY-S2": 0
          },
          "subtopics": [
            {
              "id": "ncuk-ac3-1",
              "code": "AC3.1",
              "title": "Solids, Liquids, Gases, Density and Hydrostatics",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac3-2",
              "code": "AC3.2",
              "title": "Elasticity, Hooke's Law and Young's Modulus",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac3-3",
              "code": "AC3.3",
              "title": "Specific Heat Capacity, Latent Heat and Internal Energy",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 2,
                "IFY-S1": 2,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac3-4",
              "code": "AC3.4",
              "title": "Ideal Gases and Kinetic Theory",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac4",
          "code": "AC4 / LO4",
          "title": "Electricity, Capacitance, Fields and Electromagnetism",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S1",
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 6,
          "mcqCount": 3,
          "structuredCount": 3,
          "countsByLevel": {
            "IFY": 6,
            "IFY-S1": 3,
            "IFY-S2": 3
          },
          "subtopics": [
            {
              "id": "ncuk-ac4-1",
              "code": "AC4.1",
              "title": "Current, Potential Difference, Drift Velocity and Kirchhoff's Laws",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac4-2",
              "code": "AC4.2",
              "title": "Resistance, Ohm's Law, Resistivity and Potential Dividers",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 2,
              "mcqCount": 0,
              "structuredCount": 2,
              "countsByLevel": {
                "IFY": 2,
                "IFY-S1": 2,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac4-3",
              "code": "AC4.3",
              "title": "EMF, Internal Resistance and Electrical Power",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 1,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac4-4",
              "code": "AC4.4",
              "title": "Capacitance and Exponential RC Circuits",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac4-5",
              "code": "AC4.5",
              "title": "Electric and Magnetic Fields",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 2,
                "IFY-S1": 0,
                "IFY-S2": 2
              }
            },
            {
              "id": "ncuk-ac4-6",
              "code": "AC4.6",
              "title": "Electromagnetic Induction, Motors, Generators and Transformers",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 0,
                "IFY-S2": 1
              }
            }
          ]
        },
        {
          "id": "ncuk-ac5",
          "code": "AC5 / LO5",
          "title": "Gravitation, Astronomy and Cosmology",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 1,
          "mcqCount": 0,
          "structuredCount": 1,
          "countsByLevel": {
            "IFY": 1,
            "IFY-S1": 0,
            "IFY-S2": 1
          },
          "subtopics": [
            {
              "id": "ncuk-ac5-1",
              "code": "AC5.1",
              "title": "Gravitational Fields, Orbits and Kepler's Laws",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 0,
                "IFY-S2": 1
              }
            },
            {
              "id": "ncuk-ac5-2",
              "code": "AC5.2",
              "title": "Astronomy, Stellar Evolution and Blackbody Radiation",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac5-3",
              "code": "AC5.3",
              "title": "Cosmology, Redshift and the Big Bang",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac6",
          "code": "AC6 / LO6",
          "title": "Oscillations and Waves",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "IFY": 4,
            "IFY-S1": 0,
            "IFY-S2": 4
          },
          "subtopics": [
            {
              "id": "ncuk-ac6-1",
              "code": "AC6.1",
              "title": "Simple Harmonic Motion, Damping and Resonance",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 2,
                "IFY-S1": 0,
                "IFY-S2": 2
              }
            },
            {
              "id": "ncuk-ac6-2",
              "code": "AC6.2",
              "title": "Wave Properties, Electromagnetic Spectrum and Malus's Law",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 0,
                "IFY-S2": 1
              }
            },
            {
              "id": "ncuk-ac6-3",
              "code": "AC6.3",
              "title": "Reflection, Refraction, Dispersion and Total Internal Reflection",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac6-4",
              "code": "AC6.4",
              "title": "Superposition, Interference and Diffraction Gratings",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 0,
                "IFY-S2": 1
              }
            },
            {
              "id": "ncuk-ac6-5",
              "code": "AC6.5",
              "title": "Stationary Waves in Strings and Air Pipes",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac7",
          "code": "AC7 / LO7",
          "title": "Atomic Nucleus, Radioactivity, Fission and Fusion",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 1,
          "mcqCount": 0,
          "structuredCount": 1,
          "countsByLevel": {
            "IFY": 1,
            "IFY-S1": 0,
            "IFY-S2": 1
          },
          "subtopics": [
            {
              "id": "ncuk-ac7-1",
              "code": "AC7.1",
              "title": "Atomic Nucleus, Alpha Scattering and Nuclear Density",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac7-2",
              "code": "AC7.2",
              "title": "Radioactivity, Exponential Decay and Half-Life",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac7-3",
              "code": "AC7.3",
              "title": "Mass Defect, Binding Energy, Fission and Fusion",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 0,
                "IFY-S2": 1
              }
            }
          ]
        },
        {
          "id": "ncuk-ac8",
          "code": "AC8 / LO8",
          "title": "Quantum and Particle Physics",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 0,
          "mcqCount": 0,
          "structuredCount": 0,
          "countsByLevel": {
            "IFY": 0,
            "IFY-S1": 0,
            "IFY-S2": 0
          },
          "subtopics": [
            {
              "id": "ncuk-ac8-1",
              "code": "AC8.1",
              "title": "Photons, Line Spectra and the Photoelectric Effect",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac8-2",
              "code": "AC8.2",
              "title": "Wave-Particle Duality and Heisenberg's Uncertainty Principle",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac8-3",
              "code": "AC8.3",
              "title": "The Standard Model, Quarks, Antimatter and Beta Decay",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        }
      ]
    }
  },
  "items": [
    {
      "id": "sp-v2-graphs-mcq-0081",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-a",
          "subtopicId": "ib-a2-forces-momentum"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec4-mechanics-materials",
          "subtopicId": "alevel-3-4-1-force-energy-momentum"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac2",
          "subtopicId": "ncuk-ac2-6"
        }
      ],
      "format": "mcq",
      "difficulty": "standard",
      "visualFamily": "cartesian_plot",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "graphs",
      "conceptId": "linear-momentum-impulse",
      "familyGroupKey": "linear-momentum-impulse::pt-momentum-gradient-kinetic-work"
    },
    {
      "id": "sp-circuits-11-structured-235",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-b",
          "subtopicId": "ib-b5-current-circuits"
        },
        {
          "syllabus": "alevel",
          "level": "Y12",
          "topicId": "alevel-sec5-electricity",
          "subtopicId": "alevel-3-5-1-current-electricity"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-2"
        }
      ],
      "format": "structured",
      "difficulty": "foundation",
      "visualFamily": "circuit_network",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "circuits",
      "conceptId": "resistivity-ohmic-conductors",
      "familyGroupKey": "resistivity-ohmic-conductors::cylindrical-wire-resistivity-circuit"
    },
    {
      "id": "sp-fields-mcq-0071",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-d",
          "subtopicId": "ib-d2-electric-magnetic-fields"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec7-fields-consequences",
          "subtopicId": "alevel-3-7-3-electric-fields"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-5"
        }
      ],
      "format": "mcq",
      "difficulty": "higher",
      "visualFamily": "field_map",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "fields",
      "conceptId": "electrostatic-coulomb-uniform-fields",
      "familyGroupKey": "electrostatic-coulomb-uniform-fields::symbolic-superposition-field-multiple"
    },
    {
      "id": "sp-mech-structured-0057",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-a",
          "subtopicId": "ib-a2-forces-momentum"
        },
        {
          "syllabus": "alevel",
          "level": "Y12",
          "topicId": "alevel-sec4-mechanics-materials",
          "subtopicId": "alevel-3-4-1-force-energy-momentum"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S1",
          "topicId": "ncuk-ac2",
          "subtopicId": "ncuk-ac2-6"
        }
      ],
      "format": "structured",
      "difficulty": "foundation",
      "visualFamily": "mechanics_scene",
      "totalMarks": 4,
      "hasSvg": true,
      "chunkKey": "mechanics",
      "conceptId": "linear-momentum-impulse",
      "familyGroupKey": "linear-momentum-impulse::head-on-signed-momentum-conservation"
    },
    {
      "id": "sp-v2-waves-mcq-0127",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-c",
          "subtopicId": "ib-c3-wave-phenomena"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec3-waves",
          "subtopicId": "alevel-3-3-2-refraction-diffraction-interference"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac6",
          "subtopicId": "ncuk-ac6-4"
        }
      ],
      "format": "mcq",
      "difficulty": "higher",
      "visualFamily": "waves",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "waves",
      "conceptId": "single-slit-diffraction-gratings",
      "familyGroupKey": "single-slit-diffraction-gratings::grating-lines-per-mm-diffraction-angle"
    },
    {
      "id": "sp-optics-shm-struct-0110",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-c",
          "subtopicId": "ib-c1-shm"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec6-further-mechanics-thermal",
          "subtopicId": "alevel-3-6-1-periodic-motion-shm"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac6",
          "subtopicId": "ncuk-ac6-1"
        }
      ],
      "format": "structured",
      "difficulty": "higher",
      "visualFamily": "optics-shm",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "optics-shm",
      "conceptId": "simple-harmonic-motion",
      "familyGroupKey": "simple-harmonic-motion::shm-defining-acceleration-phase-portrait"
    },
    {
      "id": "sp-thermal-mcq-0030",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-b",
          "subtopicId": "ib-b1-thermal-energy-transfers"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec6-further-mechanics-thermal",
          "subtopicId": "alevel-3-6-2-thermal-physics"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S1",
          "topicId": "ncuk-ac3",
          "subtopicId": "ncuk-ac3-3"
        }
      ],
      "format": "mcq",
      "difficulty": "standard",
      "visualFamily": "thermal",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "thermal",
      "conceptId": "specific-heat-latent-heat",
      "familyGroupKey": "specific-heat-latent-heat::ice-water-latent-mixing-and-coexistence"
    },
    {
      "id": "ga-circular-orbit-energy-str-104",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-d",
          "subtopicId": "ib-d1-gravitational-fields"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec7-fields-consequences",
          "subtopicId": "alevel-3-7-2-gravitational-fields"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac5",
          "subtopicId": "ncuk-ac5-1"
        }
      ],
      "format": "structured",
      "difficulty": "standard",
      "visualFamily": "grav-astro",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "grav-astro",
      "conceptId": "gravitational-force-field",
      "familyGroupKey": "gravitational-force-field::circular-orbit-velocity-and-kepler"
    },
    {
      "id": "sp-v2-em-induction-mcq-0095",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-d",
          "subtopicId": "ib-d4-induction"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec7-fields-consequences",
          "subtopicId": "alevel-3-7-5-magnetic-fields-induction-ac"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-6"
        }
      ],
      "format": "mcq",
      "difficulty": "higher",
      "visualFamily": "em-induction",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "em-induction",
      "conceptId": "electromagnetic-induction-faraday-lenz",
      "familyGroupKey": "electromagnetic-induction-faraday-lenz::faraday-field-reversal-induced-charge"
    },
    {
      "id": "sp-qn-structured-251",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-e",
          "subtopicId": "ib-e4-fission"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec8-nuclear-physics",
          "subtopicId": "alevel-3-8-nuclear-decay-energy"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac7",
          "subtopicId": "ncuk-ac7-3"
        }
      ],
      "format": "structured",
      "difficulty": "foundation",
      "visualFamily": "quantum-nuclear",
      "totalMarks": 5,
      "hasSvg": true,
      "chunkKey": "quantum-nuclear",
      "conceptId": "nuclear-fission-fusion",
      "familyGroupKey": "nuclear-fission-fusion::fission-fusion-reaction-q-value"
    },
    {
      "id": "sp-v3-ncuk-ac4-ivcurve-09",
      "syllabi": [
        {
          "syllabus": "ncuk",
          "level": "IFY-S1",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-2"
        },
        {
          "syllabus": "alevel",
          "level": "Y12",
          "topicId": "alevel-sec5-electricity",
          "subtopicId": "alevel-3-5-1-current-electricity"
        }
      ],
      "format": "structured",
      "difficulty": "higher",
      "visualFamily": "graphs",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "graphs",
      "conceptId": "ohms-law-iv-characteristics",
      "familyGroupKey": "ohms-law-iv-characteristics::ncuk-component-iv-curve-characteristic",
      "questionStyle": "mixed-exam"
    },
    {
      "id": "sp-v2-circuits-mcq-0090",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-b",
          "subtopicId": "ib-b5-current-circuits"
        },
        {
          "syllabus": "alevel",
          "level": "Y12",
          "topicId": "alevel-sec5-electricity",
          "subtopicId": "alevel-3-5-1-current-electricity"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-3"
        }
      ],
      "format": "mcq",
      "difficulty": "standard",
      "visualFamily": "circuit_network",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "circuits",
      "conceptId": "emf-internal-resistance",
      "familyGroupKey": "emf-internal-resistance::two-point-vi-emf-internal-resistance"
    },
    {
      "id": "sp-fields-struct-0330",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-d",
          "subtopicId": "ib-d2-electric-magnetic-fields"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec7-fields-consequences",
          "subtopicId": "alevel-3-7-3-electric-fields"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-5"
        }
      ],
      "format": "structured",
      "difficulty": "higher",
      "visualFamily": "field_map",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "fields",
      "conceptId": "electric-potential-equipotentials",
      "familyGroupKey": "electric-potential-equipotentials::coulomb-nuclear-potential-barrier"
    },
    {
      "id": "sp-mech-mcq-0216",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-a",
          "subtopicId": "ib-a2-forces-momentum"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec4-mechanics-materials",
          "subtopicId": "alevel-3-4-1-force-energy-momentum"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S1",
          "topicId": "ncuk-ac2",
          "subtopicId": "ncuk-ac2-6"
        }
      ],
      "format": "mcq",
      "difficulty": "standard",
      "visualFamily": "mechanics_scene",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "mechanics",
      "conceptId": "linear-momentum-impulse",
      "familyGroupKey": "linear-momentum-impulse::coalescing-and-rebound-collision-energetics"
    },
    {
      "id": "waves-malus-polarization-structured-305",
      "syllabi": [
        {
          "syllabus": "alevel",
          "level": "Y12",
          "topicId": "alevel-sec3-waves",
          "subtopicId": "alevel-3-3-1-progressive-stationary-waves"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac6",
          "subtopicId": "ncuk-ac6-2"
        }
      ],
      "format": "structured",
      "difficulty": "standard",
      "visualFamily": "waves",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "waves",
      "conceptId": "progressive-waves-polarization",
      "familyGroupKey": "progressive-waves-polarization::malus-polarized-analyzer-transmission"
    },
    {
      "id": "sp-optics-shm-mcq-0223",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-c",
          "subtopicId": "ib-c1-shm"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec6-further-mechanics-thermal",
          "subtopicId": "alevel-3-6-1-periodic-motion-shm"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac6",
          "subtopicId": "ncuk-ac6-1"
        }
      ],
      "format": "mcq",
      "difficulty": "higher",
      "visualFamily": "optics-shm",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "optics-shm",
      "conceptId": "simple-harmonic-motion",
      "familyGroupKey": "simple-harmonic-motion::shm-velocity-displacement-phase-ellipse"
    },
    {
      "id": "sp-thermal-struct-0205",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-b",
          "subtopicId": "ib-b1-thermal-energy-transfers"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec6-further-mechanics-thermal",
          "subtopicId": "alevel-3-6-2-thermal-physics"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac3",
          "subtopicId": "ncuk-ac3-3"
        }
      ],
      "format": "structured",
      "difficulty": "foundation",
      "visualFamily": "thermal",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "thermal",
      "conceptId": "specific-heat-latent-heat",
      "familyGroupKey": "specific-heat-latent-heat::calorimetry-solid-liquid-equilibrium"
    },
    {
      "id": "sp-pure-calc-0002",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-tools",
          "subtopicId": "ib-tools-measurement-uncertainties"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec1-measurements-errors",
          "subtopicId": "alevel-3-1-si-uncertainties-estimation"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac1",
          "subtopicId": "ncuk-ac1-1"
        }
      ],
      "format": "mcq",
      "difficulty": "standard",
      "visualFamily": "none",
      "totalMarks": 1,
      "hasSvg": false,
      "chunkKey": "pure-calculation",
      "conceptId": "si-units-dimensional-analysis",
      "familyGroupKey": "si-units-dimensional-analysis::si-cubed-prefix-bulk-density"
    }
  ],
  "chunks": {
    "graphs": {
      "chunkKey": "graphs",
      "itemCount": 2
    },
    "circuits": {
      "chunkKey": "circuits",
      "itemCount": 2
    },
    "fields": {
      "chunkKey": "fields",
      "itemCount": 2
    },
    "mechanics": {
      "chunkKey": "mechanics",
      "itemCount": 2
    },
    "waves": {
      "chunkKey": "waves",
      "itemCount": 2
    },
    "optics-shm": {
      "chunkKey": "optics-shm",
      "itemCount": 2
    },
    "thermal": {
      "chunkKey": "thermal",
      "itemCount": 2
    },
    "grav-astro": {
      "chunkKey": "grav-astro",
      "itemCount": 1
    },
    "em-induction": {
      "chunkKey": "em-induction",
      "itemCount": 1
    },
    "quantum-nuclear": {
      "chunkKey": "quantum-nuclear",
      "itemCount": 1
    },
    "pure-calculation": {
      "chunkKey": "pure-calculation",
      "itemCount": 1
    }
  }
};
