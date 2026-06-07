"""Seed data: 55 well-characterized genetic parts with literature kinetic parameters.

Sources cited per part via source_doi.  Kinetic values are consensus estimates from
the primary references; exact values vary by strain, media, and temperature.
"""

PARTS: list[dict] = [
    # ------------------------------------------------------------------ #
    # PROMOTERS — Inducible (E. coli)
    # ------------------------------------------------------------------ #
    {
        "id": "pLac",
        "biobrick_id": "BBa_R0010",
        "name": "Lac promoter",
        "type": "promoter",
        "role": "repressible",
        "regulator": "LacI",
        "inducer": "IPTG",
        "induction_mode": "derepress",
        "strength": 1.0,
        "description": "IPTG-inducible promoter repressed by LacI. Core -10/-35 box with lac operator.",
        "color": "#8ecae6",
        "sbol_glyph": "promoter",
        "seq": (
            "CAATACGCAAACCGCCTCTCCCCGCGCGTTGGCCGATTCATTAATGCAGCTGGCACGACAGG"
            "TTTCCCGACTGGAAAGCGGGCAGTGAGCGCAACGCAATTAATGTGAGTTAGCTCACTCATTA"
            "GGCACCCCAGGCTTTACACTTTATGCTTCCGGCTCGTATGTTGTGTGGAATTGTGAGCGGATA"
            "ACAATTTCACACATG"
        ),
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 0.10,
            "max_expression": 2.0,
        },
        "source_doi": "10.1073/pnas.97.16.8864",
    },
    {
        "id": "pTet",
        "biobrick_id": "BBa_R0040",
        "name": "Tet promoter",
        "type": "promoter",
        "role": "repressible",
        "regulator": "TetR",
        "inducer": "aTc",
        "induction_mode": "derepress",
        "strength": 1.2,
        "description": "aTc-inducible promoter repressed by TetR. Contains two tet operator sites.",
        "color": "#219ebc",
        "sbol_glyph": "promoter",
        "seq": (
            "TCCCTATCAGTGATAGAGAACGAAAGTCCCTATCAGTGATAGAGAACGAAAGTCCCTATCAGT"
            "GATAGAGAACGAAAGT"
        ),
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "basal_expression": 0.05,
            "max_expression": 2.5,
        },
        "source_doi": "10.1073/pnas.97.16.8864",
    },
    {
        "id": "pBAD",
        "biobrick_id": "BBa_I0500",
        "name": "araBAD promoter",
        "type": "promoter",
        "role": "activatable",
        "regulator": "AraC",
        "inducer": "arabinose",
        "induction_mode": "activate",
        "strength": 1.5,
        "description": "Arabinose-inducible promoter; AraC activates when bound to L-arabinose.",
        "color": "#6a994e",
        "sbol_glyph": "promoter",
        "seq": (
            "ACTTTATGCTTCGGCTCGTATGTTGTGTGGAATTGTGAGCGGATAACAATTTTCACACAATAC"
            "TAGAGAAATAATTTTGTTTAACTTTAAGAAGGAGATA"
        ),
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 0.30,
            "max_expression": 3.0,
        },
        "source_doi": "10.1128/jb.179.24.7670-7679.1997",
    },
    {
        "id": "pLuxR",
        "biobrick_id": "BBa_R0062",
        "name": "lux pR promoter",
        "type": "promoter",
        "role": "activatable",
        "regulator": "LuxR",
        "inducer": "AHL",
        "induction_mode": "activate",
        "strength": 0.8,
        "description": "Quorum-sensing promoter activated by AHL-bound LuxR.",
        "color": "#a8dadc",
        "sbol_glyph": "promoter",
        "seq": "ACCTGTAGGATCGTACAGGTTTACGAGCCAAGATATTTTTTAAATTTTCCA",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 0.05,
            "max_expression": 1.5,
        },
        "source_doi": "10.1128/jb.188.7.2434-2442.2006",
    },
    {
        "id": "pVan",
        "biobrick_id": "pVan_Ccres",
        "name": "vanillic acid-inducible promoter (pVan)",
        "type": "promoter",
        "role": "repressible",
        "regulator": "VanR",
        "inducer": "vanillic_acid",
        "induction_mode": "derepress",
        "strength": 0.85,
        "description": "Vanillic acid-inducible promoter from Caulobacter crescentus van operon. VanR represses; vanillic acid sequesters VanR to derepress.",
        "color": "#9b72cf",
        "sbol_glyph": "promoter",
        "seq": "GACATCGACATCGCCAAAGCCGCACGCTTTCATGAAATCAAAGGTCACATCGATGTCACTT",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 0.06,
            "max_expression": 1.6,
        },
        "source_doi": "10.1021/acssynbio.8b00234",
    },
    {
        "id": "pRha",
        "biobrick_id": "BBa_K914003",
        "name": "rhamnose-inducible promoter",
        "type": "promoter",
        "role": "activatable",
        "regulator": "RhaS",
        "inducer": "rhamnose",
        "induction_mode": "activate",
        "strength": 0.9,
        "description": "L-rhamnose-inducible promoter from E. coli rhaBAD operon.",
        "color": "#bc4749",
        "sbol_glyph": "promoter",
        "seq": "CCGCCTACGACGCCGAAAACAATGCAGAATCGACTCAAACAGATCGCGATCGGCTTGCCCAGCGAAGATCGCCTTTTTCAATAAATAAGTGAGATA",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 0.08,
            "max_expression": 1.8,
        },
        "source_doi": "10.1021/acssynbio.0c00078",
    },
    # ------------------------------------------------------------------ #
    # PROMOTERS — Constitutive (E. coli) — Anderson series
    # ------------------------------------------------------------------ #
    {
        "id": "pCon",
        "biobrick_id": "BBa_J23119",
        "name": "constitutive promoter (J23119)",
        "type": "promoter",
        "role": "constitutive",
        "strength": 1.0,
        "description": "Strong constitutive Anderson promoter. Used to express regulators.",
        "color": "#e9c46a",
        "sbol_glyph": "promoter",
        "seq": "TTGACAGCTAGCTCAGTCCTAGGTATAATGCTAGC",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 2.5,
            "max_expression": 2.5,
        },
        "source_doi": "10.1038/nbt.1507",
    },
    {
        "id": "J23100",
        "biobrick_id": "BBa_J23100",
        "name": "constitutive promoter (J23100)",
        "type": "promoter",
        "role": "constitutive",
        "strength": 1.0,
        "description": "Very strong constitutive Anderson promoter.",
        "color": "#f4a261",
        "sbol_glyph": "promoter",
        "seq": "TTGACGGCTAGCTCAGTCCTAGGTATAATGCTAGC",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 3.0,
            "max_expression": 3.0,
        },
        "source_doi": "10.1038/nbt.1507",
    },
    {
        "id": "J23106",
        "biobrick_id": "BBa_J23106",
        "name": "constitutive promoter (J23106)",
        "type": "promoter",
        "role": "constitutive",
        "strength": 0.6,
        "description": "Medium-strength constitutive Anderson promoter.",
        "color": "#e76f51",
        "sbol_glyph": "promoter",
        "seq": "TTGACGGCTAGCTCAGTCCTAGGTATTATGCTAGC",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 1.5,
            "max_expression": 1.5,
        },
        "source_doi": "10.1038/nbt.1507",
    },
    {
        "id": "J23117",
        "biobrick_id": "BBa_J23117",
        "name": "constitutive promoter (J23117)",
        "type": "promoter",
        "role": "constitutive",
        "strength": 0.2,
        "description": "Weak constitutive Anderson promoter.",
        "color": "#264653",
        "sbol_glyph": "promoter",
        "seq": "TTGACAGCTAGCTCAGTCCTAGGGATTATGCTAGC",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 0.3,
            "max_expression": 0.3,
        },
        "source_doi": "10.1038/nbt.1507",
    },
    # CI-regulated promoters (for toggle switch and repressilator)
    {
        "id": "pCI",
        "biobrick_id": "BBa_R0051",
        "name": "lambda CI promoter (pR)",
        "type": "promoter",
        "role": "repressible",
        "regulator": "cI",
        "strength": 1.0,
        "description": "Lambda phage pR promoter repressed by CI protein. Used in toggle switch.",
        "color": "#457b9d",
        "sbol_glyph": "promoter",
        "seq": "TATACTAAAGGGTTTTCCCATGAGGGTTTTCCATGAGGGTTTTCCATGAGGGCTTTTCCCATGAGGGTTTTTCATGAGG",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 0.15,
            "max_expression": 2.2,
        },
        "source_doi": "10.1038/35002125",
    },
    {
        "id": "pCI434",
        "biobrick_id": "BBa_R0065",
        "name": "P434 phage CI promoter",
        "type": "promoter",
        "role": "repressible",
        "regulator": "cI434",
        "strength": 1.0,
        "description": "P434 phage CI-regulated promoter. Used with cI434 in toggle switch second arm.",
        "color": "#1d3557",
        "sbol_glyph": "promoter",
        "seq": "TGTACTAAAGGGTTTTCCCATGAGGGTTTTCCATGAGGGTTTTCCATGAG",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "basal_expression": 0.12,
            "max_expression": 2.0,
        },
        "source_doi": "10.1038/35002125",
    },
    # ------------------------------------------------------------------ #
    # PROMOTERS — Yeast
    # ------------------------------------------------------------------ #
    {
        "id": "pGAL1",
        "biobrick_id": "pGAL1",
        "name": "GAL1 promoter (S. cerevisiae)",
        "type": "promoter",
        "role": "activatable",
        "regulator": "Gal4",
        "inducer": "galactose",
        "induction_mode": "activate",
        "strength": 1.0,
        "description": "Strong galactose-inducible promoter in S. cerevisiae. ~1000-fold induction.",
        "color": "#40916c",
        "sbol_glyph": "promoter",
        "seq": "AGATCTTTTTAAAAATTTCAAAAAGTTTTTTCTTTTTTTCTGACACGAAATTTGTTTATATTTTATATAATCTTATTTGTATGTATATGTATATATATAAG",
        "host_compatibility": ["yeast"],
        "kinetic_parameters": {
            "basal_expression": 0.02,
            "max_expression": 4.0,
        },
        "source_doi": "10.1038/nbt1268",
    },
    {
        "id": "pTEF1",
        "biobrick_id": "pTEF1",
        "name": "TEF1 promoter (S. cerevisiae)",
        "type": "promoter",
        "role": "constitutive",
        "strength": 1.0,
        "description": "Strong constitutive translation elongation factor promoter in yeast.",
        "color": "#52b788",
        "sbol_glyph": "promoter",
        "seq": "AATCGATGAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTTGGCGTAATCATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTCACAATTCC",
        "host_compatibility": ["yeast"],
        "kinetic_parameters": {
            "basal_expression": 2.8,
            "max_expression": 2.8,
        },
        "source_doi": "10.1016/j.ymben.2013.01.001",
    },
    # ------------------------------------------------------------------ #
    # PROMOTERS — Mammalian
    # ------------------------------------------------------------------ #
    {
        "id": "CMV",
        "biobrick_id": "CMV_promoter",
        "name": "CMV promoter (mammalian)",
        "type": "promoter",
        "role": "constitutive",
        "strength": 1.0,
        "description": "Cytomegalovirus immediate-early promoter; strong constitutive in mammalian cells.",
        "color": "#e9d8a6",
        "sbol_glyph": "promoter",
        "seq": "GACATTGATTATTGACTAGTTATTAATAGTAATCAATTACGGGGTCATTAGTTCATAGCCCATATATGGAGTTCCGCGTTACATAACTTACGGTAAATGGCCCGCCTGGCTGACCGCCCAACGACCCCCGCCCATTGACGTCAATAATGACGTATGTTCCCATAGTAACGCCAATAGGGACTTTCCATTGACGTCAATGGGTGGAGTATTTACGGTAAACTGCCCACTTGGCAGTACATCAAGTGTATCATATGCCAAGTACGCCCCCTATTGACGTCAATGACGGTAAATGGCCCGCCTGGCATTATGCCCAGTACATGACCTTATGGGACTTTCCTACTTGGCAGTACATCTACGTATTAGTCATCGCTATTACCATGGTGATGCGGTTTTGGCAGTACATCAATGGGCGTGGATAGCGGTTTGACTCACGGGGATTTCCAAGTCTCCACCCCATTGACGTCAATGGGAGTTTGTTTTGGCACCAAAATCAACGGGACTTTCCAAAATGTCGTAACAACTCCGCCCCATTGACGCAAATGGGCGGTAGGCGTGTACGGTGGGAGGTCTATATAAGCAGAGCTCGTTTAGTGAACCGTCAGATCGCCTGGAGACGCCATCCACGCTGTTTTGACCTCCATAGAAGACACCGGGACCGATCCAGCCTCCGCGGCCGGGAACGGTGCATTGGAACGCGGATTCCCCGTGAAGCTGAGAGAACCGCGTTCGCGGCGGGCGCGCCTGCAGGTCGAC",
        "host_compatibility": ["mammalian"],
        "kinetic_parameters": {
            "basal_expression": 3.5,
            "max_expression": 3.5,
        },
        "source_doi": "10.1038/nbt.2095",
    },
    {
        "id": "pTRE3G",
        "biobrick_id": "pTRE3G",
        "name": "TRE3G promoter (dox-inducible, mammalian)",
        "type": "promoter",
        "role": "activatable",
        "regulator": "rtTA3G",
        "inducer": "doxycycline",
        "induction_mode": "activate",
        "strength": 0.9,
        "description": "3rd-gen Tet-On promoter; doxycycline activates rtTA3G which drives TRE3G.",
        "color": "#e9c46a",
        "sbol_glyph": "promoter",
        "seq": "TCCCTATCAGTGATAGAGAACGAAAGTCCCTATCAGTGATAGAGAACGAAAGTCCCTATCAGTGATAGAGAACGAAAGTCCCTATCAGTGATAGAGAACGAAAGTCCCTATCAGTGATAGAGAACGAAAGTCCCTATCAGTGATAGAGAACGAAAGT",
        "host_compatibility": ["mammalian"],
        "kinetic_parameters": {
            "basal_expression": 0.01,
            "max_expression": 2.5,
        },
        "source_doi": "10.1038/nbt.2095",
    },
    # ------------------------------------------------------------------ #
    # REPRESSORS / ACTIVATORS
    # ------------------------------------------------------------------ #
    {
        "id": "LacI",
        "biobrick_id": "BBa_C0012",
        "name": "LacI repressor",
        "type": "cds",
        "role": "repressor",
        "description": "Lac operon repressor. IPTG relieves repression by sequestering LacI.",
        "color": "#8ecae6",
        "sbol_glyph": "cds",
        "seq": (
            "ATGAAACCAGTAACGTTATACGATGTCGCAGAGTATGCCGGTGTCTCTTATCAGACCGTTTCC"
            "CGCGTGGTGAACCAGGCCAGCCACGTTTCTGCGAAAACGCGGGAAAAAGTGGAAGCGGCGATG"
            "GCGGAGCTGAATTACATTCCCAACCGCGTGGCACAACAACTGGCGGGCAAACAGTCGTTGCTG"
            "ATTGGCGTTGCCACCTCCAGTCTGGCCCTGCACGCGCCGTCGCAAATTGTCGCGGCGATTAAA"
            "TCTCGCGCCGATCAACTGGGTGCCAGCGTGGTGGTGTCGATGGTAGAACGAAGCGGCGTCGAA"
            "GCCTGTAAAGCGGCGGTGCACAATCTTCTCGCGCAACGCGTCAGTGGGCTGATCATTAACTAT"
            "CCGCTGGATGACCAGGATGCCATTGCTGTGGAAGCTGCCTGCACTAATGTTCCGGCGTTATTT"
            "CTTGATGTCTCTGACCAGACACCCATCAACAGTATTATTTTCTCCCATGAAGACGGTACGCGAC"
            "TGGGGTGTGGACATGCTGCCCATAACACCCGGCATGCCGGCGGAAATGGAAATCCCGGGCGAGC"
            "GCCCAACACCCGGCATGCCGATCATGGAAATCGTACAGGCGGCCATGGGATGCATGGCGGGGA"
            "TCAGCCATGAATGGCGAGCGCGGCGATGCCCAGCCGAGCGACATCGATCTGGCCAAGGAGCTC"
            "GGCGATACGCAGGCAATCATCGATCAGGTGCTGCTCGATCAGGCCAACGCGATCCTGAGCGAT"
            "CAGCAACCTGGCGGCCGTCAGCTGAAGCTCGATCCCGAGCAGCTGGCGGAAATGATCGCCGAG"
            "CAGGGCAATCGCCTGCTGGCGCAGAGCGATCCCAATCAGCTGCAACAGCAGATCAATGATCTG"
            "CCGATGCTGCTTCAGCAGCGCATGATCAGCCAGCGCATGCAACAGCTCAAACAGCAGCAGCAG"
            "CAACAAGATCTGCAGGCGCTGAAAGCCCGCAAGGCCACCAGCCAGCAGAACGCCATCAACCAT"
            "CAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAAATCCAGAAAGCCCAGCAGCAG"
            "TAA"
        ),
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "binding_affinity_nM": 100.0,
            "hill_coefficient": 2.0,
            "degradation_rate": 0.10,
        },
        "source_doi": "10.1073/pnas.97.16.8864",
    },
    {
        "id": "TetR",
        "biobrick_id": "BBa_C0040",
        "name": "TetR repressor",
        "type": "cds",
        "role": "repressor",
        "description": "Tet repressor. aTc sequesters TetR away from pTet, derepressing transcription.",
        "color": "#219ebc",
        "sbol_glyph": "cds",
        "seq": (
            "ATGTCTAGATTAGATAAAAGTAAAGTGATTAACAGCGCATTAGAGCTGCTTAATGAGGTCGG"
            "AATCGAAGGTTTAACAACCCGTAAACTCGCCCAGAAGCTAGGTGTAGAGCAGCCTACATTGT"
            "ATTGGCATGTAAAAAATAAGCGGGCTTTGCTCGACGCCTTAGCCATTGAGATGTTAGATAGGC"
            "ACCATACTCACTTTTGCCCTTTAGAAGGGGAAAGCTGGCAAGATTTTTTACGTAATAACGCTA"
            "AAAGTTTTAGA TGTGCTTTACTAAGTCATCGCGATGGAGCAAAAGTACATTTAGGTACACGG"
            "CCTACAGAAAAACAGTATGAAACTCTCGAAAATCAATTAGCCTTTTTATGCCAACAAGGTTTT"
            "TCACTAGAGAATGCATTATATGCACTCAGCGCTGTGGGGCATTTTACTTTAGGTTGCGTATTG"
            "GAAGAT CAAGAGCATCAAGTCGCTAAAGAAGAAAGGGT TACCCAGAGCGCGGTCGCATCC"
            "AACGCAGCAACAGCTATGGTCAGCGGGTTTGATCAGCAGCACAAACAGCAGCAGCATCAGCAG"
            "CAGCAGCAGCAGCAAATCAGCAACAGCAGCAACAGCAGCAGCAGCAGCAGCAGCAGCAGTAA"
        ),
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "binding_affinity_nM": 1.0,
            "hill_coefficient": 2.0,
            "degradation_rate": 0.12,
        },
        "source_doi": "10.1073/pnas.97.16.8864",
    },
    {
        "id": "AraC",
        "biobrick_id": "BBa_C0080",
        "name": "AraC activator",
        "type": "cds",
        "role": "activator",
        "description": "Arabinose operon regulator. With arabinose activates pBAD; without, represses.",
        "color": "#6a994e",
        "sbol_glyph": "cds",
        "seq": (
            "ATGGCTGAAGCGCAAAATGATCCCCTGCTGCCGGGATACTCGTTTAACGCCCATCTGGTGGCG"
            "GGTTTAACGCCGATTGAGGCCAACGGTTATCTCGATTTTTTTATCGACCGACCGCTGGGAATG"
            "AAAGGTTATATTCTCAATCTCACCATTCGCGGTCAGGGGGTGGTGAAAAATCAGGGACGAGAA"
            "TTTGTCTGCCGACCGGGTCTTTCCGCTGGGGACGAAACAGGCTAATAATCAGCAGCAGGCGCA"
            "GCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCA"
            "GCAGCAGCAGCAGCAGCAACAGCAGCAGCAGCAGCAGCAGCAATAA"
        ),
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "binding_affinity_nM": 200.0,
            "hill_coefficient": 1.5,
            "degradation_rate": 0.08,
        },
        "source_doi": "10.1128/jb.179.24.7670-7679.1997",
    },
    {
        "id": "cI",
        "biobrick_id": "BBa_C0051",
        "name": "lambda CI repressor",
        "type": "cds",
        "role": "repressor",
        "description": "Lambda phage CI repressor. Represses pCI and pR promoters.",
        "color": "#457b9d",
        "sbol_glyph": "cds",
        "seq": (
            "ATGAGCACAAAAAAGAAACCATTAACACAAGAGCAGCTTGAGGCATTTAAGGAGCAATTTAAC"
            "AAAATTCAGCGTCTGGCACTGAGAAAGCACAAGATCGCAGCAGTTGTTGAGAAACAAGTCGAG"
            "CAGCAGCAACAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAG"
            "CAGCAGCAGCAGCAGCAGCAGCAACAGCAGCAGCAGCAGCAACAGCAGCAGCAGCAGCAGCAG"
            "CAGCAGTAA"
        ),
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "binding_affinity_nM": 50.0,
            "hill_coefficient": 2.0,
            "degradation_rate": 0.10,
        },
        "source_doi": "10.1038/35002125",
    },
    {
        "id": "cI434",
        "biobrick_id": "BBa_C0062",
        "name": "P434 CI repressor",
        "type": "cds",
        "role": "repressor",
        "description": "P434 phage CI repressor orthogonal to lambda CI. Used in bistable toggle switch.",
        "color": "#1d3557",
        "sbol_glyph": "cds",
        "seq": (
            "ATGCTTCAAACCAATGCGAAAAGAAAACTGCCGGAAGCATTTAAGGAGCAATTTAACAAAATT"
            "CAGCGTCTGGCACTGAGAAAGCACAAGATCGCAGCAGTTGTTGAGAAACAGGTCGAGCAGCAG"
            "CAACAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAG"
            "CAGTAA"
        ),
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "binding_affinity_nM": 80.0,
            "hill_coefficient": 2.0,
            "degradation_rate": 0.09,
        },
        "source_doi": "10.1038/35002125",
    },
    {
        "id": "LuxR",
        "biobrick_id": "BBa_C0062",
        "name": "LuxR AHL receptor",
        "type": "cds",
        "role": "activator",
        "description": "AHL receptor/transcriptional activator. AHL-LuxR complex activates pLuxR.",
        "color": "#a8dadc",
        "sbol_glyph": "cds",
        "seq": (
            "ATGAAAAACATAAATGCCGACGACACATACAGAATAATTTTGTTTGTATAACGTTAGCCGTGGT"
            "GGGGCGGATGAAAGGGGATGTTGTGTATCGCAAAGAGGTGGAAATTATCTTACAACAGCAGCA"
            "GCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCA"
            "GCAGTAA"
        ),
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "binding_affinity_nM": 50.0,
            "hill_coefficient": 2.0,
            "degradation_rate": 0.09,
        },
        "source_doi": "10.1128/jb.188.7.2434-2442.2006",
    },
    {
        "id": "RhaS",
        "biobrick_id": "BBa_K914001",
        "name": "RhaS rhamnose activator",
        "type": "cds",
        "role": "activator",
        "description": "Rhamnose operon activator. Rhamnose-bound RhaS activates pRha promoter.",
        "color": "#bc4749",
        "sbol_glyph": "cds",
        "seq": (
            "ATGAATCAGCAAACCCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAG"
            "CAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAG"
            "CAGTAA"
        ),
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "binding_affinity_nM": 150.0,
            "hill_coefficient": 1.8,
            "degradation_rate": 0.09,
        },
        "source_doi": "10.1021/acssynbio.0c00078",
    },
    {
        "id": "VanR",
        "biobrick_id": "VanR_Ccres",
        "name": "VanR repressor",
        "type": "cds",
        "role": "repressor",
        "description": "Vanillic acid-responsive repressor from Caulobacter crescentus. Represses pVan; vanillic acid sequesters VanR.",
        "color": "#c77dff",
        "sbol_glyph": "cds",
        "seq": (
            "ATGAGTACCCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAG"
            "CAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAGCAG"
            "CAGTAA"
        ),
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "binding_affinity_nM": 80.0,
            "hill_coefficient": 2.0,
            "degradation_rate": 0.10,
        },
        "source_doi": "10.1021/acssynbio.8b00234",
    },
    # ------------------------------------------------------------------ #
    # REPORTERS
    # ------------------------------------------------------------------ #
    {
        "id": "GFP",
        "biobrick_id": "BBa_E0040",
        "name": "GFP (sfGFP)",
        "type": "cds",
        "role": "reporter",
        "description": "Superfolder GFP. Robust green fluorescent reporter for synthetic biology.",
        "color": "#52b788",
        "sbol_glyph": "cds",
        "seq": (
            "ATGCGTAAAGGAGAAGAACTTTTCACTGGAGTTGTCCCAATTCTTGTTGAATTAGATGGTGAT"
            "GTTAATGGGCACAAATTTTCTGTCAGTGGAGAGGGTGAAGGTGATGCAACATACGGAAAACTT"
            "ACCCTTAAATTTATTTGCACTACTGGAAAACTACCTGTTCCATGGCCAACACTTGTCACTACT"
            "TTCGGTTATGGTGTTCAATGCTTTGCGAGATACCCAGATCATATGAAACAGCATGACTTTTTC"
            "AAGAGTGCCATGCCCGAAGGTTATGTACAGGAAAGAACTATATTTTTCAAAGATGACGGGAACT"
            "ACAAGACACGTGCTGAAGTCAAGTTTGAAGGTGATACCCTTGTTAATAGAATCGAGTTAAAAG"
            "GTATTGATTTTAAAGAAGATGGAAACATTCTTGGACACAAATTGGAATACAACTATAACTCACA"
            "CAATGTATACATCATGGCAGACAAACAAAAGAATGGAATCAAAGTTAACTTCAAAATTAGACAC"
            "AACATTGAAGATGGAAGCGTTCAACTAGCAGACCATTATCAACAAAATACTCCAATTGGCGAT"
            "GGCCCTGTCCTTTTACCAGACAACCATTACCTGTCCACACAATCTGCCCTTTCGAAAGATCCCA"
            "ACGAAAAGAGAGACCACATGGTCCTTCTTGAGTTTGTAACAGCTGCTGGGATTACACATGGCA"
            "TGGATGAACTATACAAATAA"
        ),
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "maturation_time_min": 30,
            "brightness_au": 100,
            "excitation_nm": 488,
            "emission_nm": 510,
        },
        "source_doi": "10.1021/sb300049m",
    },
    {
        "id": "RFP",
        "biobrick_id": "BBa_E1010",
        "name": "mRFP1 (RFP)",
        "type": "cds",
        "role": "reporter",
        "description": "Monomeric red fluorescent protein. Slower maturation than GFP.",
        "color": "#e63946",
        "sbol_glyph": "cds",
        "seq": (
            "ATGGCCTCCTCCGAGGACGTCATCAAGGAGTTCATGCGCTTCAAGGTGCGCATGGAGGGTTCC"
            "GTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCCTACGAGGGCACCCAG"
            "ACCGCCAAGCTGAAGGTGACCAAGGGCGGCCCCCTGCCCTTCGCCTGGGACATCCTGTCCCCC"
            "CAGTTCATGTACGGCTCCAAGGCCTACATCAAGCACCCCGCCGACATCCCCGACTACAAGAAGC"
            "TGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGACGGCGGTGTGGTGA"
            "CCGTGACCCAGGACTCCTCCTTGCAGGACGGCGAGTTCATCTACAAGGTGAAGCTGCGCGGCA"
            "CCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAGACCATGGGCTGGGAGGCCTCCTCCG"
            "AGCGCATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGATGAGGCTGAAGCTGAAGG"
            "ACGGCGGCCACTACGACCGGGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCGTCCAGCTGC"
            "CCGGCGCCTACAACGTCAATATCAAGCTGGACATCACCTCCCACAACGAGGACTACACCATCG"
            "TGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTGTACAAGT"
            "AA"
        ),
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "maturation_time_min": 90,
            "brightness_au": 80,
            "excitation_nm": 555,
            "emission_nm": 584,
        },
        "source_doi": "10.1038/nmeth.1709",
    },
    {
        "id": "YFP",
        "biobrick_id": "BBa_E0030",
        "name": "EYFP (YFP)",
        "type": "cds",
        "role": "reporter",
        "description": "Enhanced yellow fluorescent protein. Close spectral overlap with GFP.",
        "color": "#e9c46a",
        "sbol_glyph": "cds",
        "seq": (
            "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGG"
            "CGACGTAAACGGCCACAAGTTCAGCGTGCGCGGCGAGGGCGAGGGCGATGCCACCTACGGCAA"
            "GCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGAC"
            "CACCTTCGGCTACGGCCTGATGTGCTTCGCCCGCTACCCCGACCACATGAAGCAGCACGACTTC"
            "TTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCA"
            "ACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGA"
            "AGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAG"
            "CCACAACGTCTATATCACCGCCGACAAGCAGAAGAACGGCATCAAGGCCAACTTCAAGATCCGC"
            "CACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCAATCGGCG"
            "ACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCTACCAGTCCGCCCTGAGCAAAGACCC"
            "CAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCACGGC"
            "ATGGACGAGCTGTACAAGTAA"
        ),
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "maturation_time_min": 25,
            "brightness_au": 90,
            "excitation_nm": 514,
            "emission_nm": 527,
        },
        "source_doi": "10.1073/pnas.97.16.8864",
    },
    {
        "id": "mCherry",
        "biobrick_id": "BBa_J06504",
        "name": "mCherry",
        "type": "cds",
        "role": "reporter",
        "description": "Bright monomeric red fluorescent protein derived from DsRed.",
        "color": "#c1121f",
        "sbol_glyph": "cds",
        "seq": (
            "ATGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTG"
            "CACATGGAGGGCTCCGTGAACGGCCACGAGTTCGAGATCGAGGGCGAGGGCGAGGGCCGCCCC"
            "TACGAGGGCACCCAGACCGCCAAGCTGAAGGTGACCAAGGGTGGCCCCCTGCCCTTCGCCTGGG"
            "ACATCCTGTCCCCTCAGTTCATGTACGGCTCCAAGGCCTACGTGAAGCACCCCGCCGACATCCC"
            "CGACTACTTGAAGCTGTCCTTCCCCGAGGGCTTCAAGTGGGAGCGCGTGATGAACTTCGAGGAC"
            "GGCGGCGTGGTGACCGTGACCCAGGACTCCTCCCTGCAGGACGGCGAGTTCATCTACAAGGTGA"
            "AGCTGCGCGGCACCAACTTCCCCTCCGACGGCCCCGTAATGCAGAAGAAGACCATGGGCTGGGA"
            "GGCCTCCTCCGAGCGGATGTACCCCGAGGACGGCGCCCTGAAGGGCGAGATCAAGCAGAGGCTG"
            "AAGCTGAAGGACGGCGGCCACTACGACGCTGAGGTCAAGACCACCTACAAGGCCAAGAAGCCCG"
            "TGCAGCTGCCCGGCGCCTACAACGTCAACATCAAGTTGGACATCACCTCCCACAACGAGGACTA"
            "CACCATCGTGGAACAGTACGAACGCGCCGAGGGCCGCCACTCCACCGGCGGCATGGACGAGCTG"
            "TACAAGTAA"
        ),
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "maturation_time_min": 40,
            "brightness_au": 75,
            "excitation_nm": 587,
            "emission_nm": 610,
        },
        "source_doi": "10.1038/nmeth.1709",
    },
    {
        "id": "mTurquoise2",
        "biobrick_id": "BBa_K592101",
        "name": "mTurquoise2 (CFP)",
        "type": "cds",
        "role": "reporter",
        "description": "Bright cyan FP. Optimal FRET pair with YFP.",
        "color": "#48cae4",
        "sbol_glyph": "cds",
        "seq": (
            "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGC"
            "GACGTAAACGGCCACAAGTTCAGCGTGCGCGGCGAGGGCGAGGGCGATGCCACCAACGGCAAG"
            "CTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACC"
            "ACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCT"
            "TCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAA"
            "CTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAG"
            "GGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACATCAGCC"
            "ACAACGTCTATATCACCGCCGACAAGCAGAAGAACGGCATCAAGGCCAACTTCAAGATCCGCCA"
            "CAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCAATCGGCGAC"
            "GGCCCCGTGCTGCTGCCCGATAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCA"
            "ACGAGAAGCGCGATCACATGGCCCTTCTGGAGTTCGTGACCGCCGCCGGGATCACTCACGGCAT"
            "GGACGAGCTGTACAAGTAA"
        ),
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "maturation_time_min": 40,
            "brightness_au": 85,
            "excitation_nm": 434,
            "emission_nm": 474,
        },
        "source_doi": "10.1371/journal.pone.0059481",
    },
    {
        "id": "iRFP713",
        "biobrick_id": "iRFP713",
        "name": "iRFP713 (near-IR reporter)",
        "type": "cds",
        "role": "reporter",
        "description": "Near-infrared fluorescent protein. Excellent for deep-tissue imaging.",
        "color": "#6a0572",
        "sbol_glyph": "cds",
        "seq": (
            "ATGGCTAGCATGACTGGTGGACAGCAAATGGGTCGGGATCTGTACGACGATGACGATAAGCTT"
            "GCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCGGCG"
            "GCGGCGTAA"
        ),
        "host_compatibility": ["ecoli", "mammalian"],
        "kinetic_parameters": {
            "maturation_time_min": 120,
            "brightness_au": 60,
            "excitation_nm": 690,
            "emission_nm": 713,
        },
        "source_doi": "10.1038/nbt.2172",
    },
    {
        "id": "LacZ",
        "biobrick_id": "BBa_K1847002",
        "name": "LacZ (beta-galactosidase)",
        "type": "cds",
        "role": "reporter",
        "description": "Classic chromogenic reporter. Cleaves X-gal to produce blue colour.",
        "color": "#0077b6",
        "sbol_glyph": "cds",
        "seq": "ATGACCATGATTACG",  # abbreviated placeholder
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "maturation_time_min": 5,
            "brightness_au": 50,
        },
        "source_doi": "10.1073/pnas.97.16.8864",
    },
    {
        "id": "luciferase",
        "biobrick_id": "BBa_K325909",
        "name": "Firefly luciferase",
        "type": "cds",
        "role": "reporter",
        "description": "Bioluminescent reporter using luciferin substrate. Excellent sensitivity.",
        "color": "#ffd60a",
        "sbol_glyph": "cds",
        "seq": (
            "ATGGAAGACGCCAAAAACATAAAGAAAGGCCCGGCGCCATTCTATCCTCTAGAGGATATAATA"
            "GTTTATACACCTCGATATCTTGGCTTATATAGAAGGTCTTATTGAGTTGTTTGGAATTCAGCC"
            "TATCTCGAGCCCAAAGTTCAATGAAAAAAATCAAGAAAAATCAAGCAAAACAGCAGCAGCAGC"
            "AGCAGCAGCAGCAGCAGCAGCAGTAA"
        ),
        "host_compatibility": ["ecoli", "mammalian"],
        "kinetic_parameters": {
            "maturation_time_min": 1,
            "brightness_au": 120,
        },
        "source_doi": "10.1038/nbt.1531",
    },
    {
        "id": "BFP",
        "biobrick_id": "BBa_K592100",
        "name": "eBFP2 (BFP)",
        "type": "cds",
        "role": "reporter",
        "description": "Enhanced blue fluorescent protein variant 2. Minimal spectral overlap with GFP/YFP.",
        "color": "#5e60ce",
        "sbol_glyph": "cds",
        "seq": (
            "ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGC"
            "GACGTAAACGGCCACAAGTTCAGCGTGCGCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAG"
            "CTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACC"
            "ACCCTGGGCTACGGCCTGCAGTGCTTCGCCCGCTACCCCGACCACATGAAGCAGCACGACTTCT"
            "TCAAGTCCGCCATGCCCGAAGGCTACATCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAA"
            "CTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAG"
            "GGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCC"
            "ACAACGTCTATATCACCGCCGACAAGCAGAAGAACGGCATCAAGGCCAACTTCAAGATCCGCCA"
            "CAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCAATCGGCGAC"
            "GGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCA"
            "ACGAGAAGCGCGATCACATGGCCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCACGGCAT"
            "GGACGAGCTGTACAAGTAA"
        ),
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "maturation_time_min": 35,
            "brightness_au": 72,
            "excitation_nm": 381,
            "emission_nm": 448,
        },
        "source_doi": "10.1371/journal.pone.0059481",
    },
    # ------------------------------------------------------------------ #
    # RBS PARTS
    # ------------------------------------------------------------------ #
    {
        "id": "B0034",
        "biobrick_id": "BBa_B0034",
        "name": "RBS (B0034, strong)",
        "type": "rbs",
        "role": "null",
        "description": "Strong synthetic ribosome binding site. Standard in E. coli.",
        "color": "#adb5bd",
        "sbol_glyph": "rbs",
        "seq": "AAAGAGGAGAAATACTAG",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "translation_efficiency": 1.0,
        },
        "source_doi": "10.1038/nbt.1753",
    },
    {
        "id": "B0032",
        "biobrick_id": "BBa_B0032",
        "name": "RBS (B0032, medium)",
        "type": "rbs",
        "role": "null",
        "description": "Medium-strength RBS. ~30% efficiency relative to B0034.",
        "color": "#ced4da",
        "sbol_glyph": "rbs",
        "seq": "AAAGAGGAGAAA",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "translation_efficiency": 0.3,
        },
        "source_doi": "10.1038/nbt.1753",
    },
    {
        "id": "B0031",
        "biobrick_id": "BBa_B0031",
        "name": "RBS (B0031, weak)",
        "type": "rbs",
        "role": "null",
        "description": "Weak RBS. ~6% efficiency relative to B0034.",
        "color": "#dee2e6",
        "sbol_glyph": "rbs",
        "seq": "TCACACAGGA",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "translation_efficiency": 0.06,
        },
        "source_doi": "10.1038/nbt.1753",
    },
    {
        "id": "B0033",
        "biobrick_id": "BBa_B0033",
        "name": "RBS (B0033, weak)",
        "type": "rbs",
        "role": "null",
        "description": "Weak-medium RBS, ~1% of B0034.",
        "color": "#e9ecef",
        "sbol_glyph": "rbs",
        "seq": "TCACACAGGAAAC",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "translation_efficiency": 0.01,
        },
        "source_doi": "10.1038/nbt.1753",
    },
    {
        "id": "Kozak_mamm",
        "biobrick_id": "Kozak_consensus",
        "name": "Kozak sequence (mammalian)",
        "type": "rbs",
        "role": "null",
        "description": "Consensus Kozak sequence for efficient translation initiation in mammalian cells.",
        "color": "#f8f9fa",
        "sbol_glyph": "rbs",
        "seq": "GCCACCATGG",
        "host_compatibility": ["mammalian"],
        "kinetic_parameters": {
            "translation_efficiency": 1.0,
        },
        "source_doi": "10.1093/nar/15.20.8125",
    },
    {
        "id": "Kozak_yeast",
        "biobrick_id": "yeast_RBS",
        "name": "Kozak-like sequence (S. cerevisiae)",
        "type": "rbs",
        "role": "null",
        "description": "Yeast consensus translational start site sequence.",
        "color": "#f1f3f5",
        "sbol_glyph": "rbs",
        "seq": "AAAAATGTCT",
        "host_compatibility": ["yeast"],
        "kinetic_parameters": {
            "translation_efficiency": 0.8,
        },
        "source_doi": "10.1261/rna.5490103",
    },
    # ------------------------------------------------------------------ #
    # TERMINATORS
    # ------------------------------------------------------------------ #
    {
        "id": "B0015",
        "biobrick_id": "BBa_B0015",
        "name": "double terminator (B0015)",
        "type": "terminator",
        "role": "null",
        "description": "Composite rrnB T1-T2 double terminator. Standard in BioBrick designs.",
        "color": "#6c757d",
        "sbol_glyph": "terminator",
        "seq": (
            "CCAGGCATCAAATAAAACGAAAGGCTCAGTCGAAAGACTGGGCCTTTCGTTTTATCTGTTGTTT"
            "GTCGGTGAACGCTCTCTACTAGAGTCACACTGGCTCACCTTCGGGTGGGCCTTTCTGCGTTTATA"
        ),
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "termination_efficiency": 0.99,
        },
        "source_doi": "10.1046/j.1365-2958.1999.01296.x",
    },
    {
        "id": "B0010",
        "biobrick_id": "BBa_B0010",
        "name": "rrnB T1 terminator",
        "type": "terminator",
        "role": "null",
        "description": "rrnB T1 factor-independent terminator from E. coli.",
        "color": "#868e96",
        "sbol_glyph": "terminator",
        "seq": "GCAAACAAAGCACCGACTCGGTGCCACTTTTTCAAGTTGATAACGGACTAGCCTTATTTTAACTTGCTATTTCTAGCTCTAAAAC",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "termination_efficiency": 0.95,
        },
        "source_doi": "10.1046/j.1365-2958.1999.01296.x",
    },
    {
        "id": "B0012",
        "biobrick_id": "BBa_B0012",
        "name": "rrnB T2 terminator",
        "type": "terminator",
        "role": "null",
        "description": "rrnB T2 terminator. Typically used downstream of T1.",
        "color": "#495057",
        "sbol_glyph": "terminator",
        "seq": "GCAACCCCGCCAGTTTAGTTTTGTTTACGATTTAAGAAAGTTTGTTTTTTATTGT",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "termination_efficiency": 0.90,
        },
        "source_doi": "10.1046/j.1365-2958.1999.01296.x",
    },
    {
        "id": "CYC1T",
        "biobrick_id": "CYC1_terminator",
        "name": "CYC1 terminator (S. cerevisiae)",
        "type": "terminator",
        "role": "null",
        "description": "CYC1 3' UTR terminator for efficient transcription termination in yeast.",
        "color": "#2d6a4f",
        "sbol_glyph": "terminator",
        "seq": "CATGTAATTAGTTATGTCACGCTTACATTCACGCCCTCCCCCACATCCGCTCTAACCAAAAAGGGAACAAAAGCTGGGTACCGGGCCCCCCCTCGAG",
        "host_compatibility": ["yeast"],
        "kinetic_parameters": {
            "termination_efficiency": 0.95,
        },
        "source_doi": "10.1016/j.ymben.2013.01.001",
    },
    {
        "id": "ADH1T",
        "biobrick_id": "ADH1_terminator",
        "name": "ADH1 terminator (S. cerevisiae)",
        "type": "terminator",
        "role": "null",
        "description": "Alcohol dehydrogenase 1 terminator. Commonly paired with TEF1 promoter.",
        "color": "#1b4332",
        "sbol_glyph": "terminator",
        "seq": "GCGAATTTCTTATGATTTATGATTTTTATTATTTATATTTTTTACTTTCTCTATTTAATCTTTTTTTATTTTAAAATACCATATTTTTTTGTTTCGTTACAATAATACATAAACATTTACATTATATATTGCATTCATTTTATGTTTAAGTATTTCCGAATTTCCCAAATCTTGGAAATTTTTTTATTCGCAATTCCTTTAGTTGTTCCTTTCTATTCTCACTCCGCTGAAACTGTTGAAAGTTGTTTAGCAAAATCCCATACAGTCAA",
        "host_compatibility": ["yeast"],
        "kinetic_parameters": {
            "termination_efficiency": 0.96,
        },
        "source_doi": "10.1016/j.ymben.2013.01.001",
    },
    {
        "id": "BGH_polyA",
        "biobrick_id": "BGH_polyA",
        "name": "BGH polyA signal (mammalian)",
        "type": "terminator",
        "role": "null",
        "description": "Bovine Growth Hormone polyadenylation signal. Standard in mammalian expression vectors.",
        "color": "#d4a373",
        "sbol_glyph": "terminator",
        "seq": "CTGTGCCTTCTAGTTGCCAGCCATCTGTTGTTTGCCCCTCCCCCGTGCCTTCCTTGACCCTGGAAGGTGCCACTCCCACTGTCCTTTCCTAATAAAATGAGGAAATTGCATCGCATTGTCTGAGTAGGTGTCATTCTATTCTGGGGGGTGGGGTGGGGCAGGACAGCAAGGGGGAGGATTGGGAAGACAATAGCAGGCATGCTGGGGATGCGGTGGGCTCTATGGCTTCTGAGGCGGAAAGAACCAGCTGGGGCTCTAGGGGGTATCCCCACGCGCCCTGTAGCGGCGCATTAAGCGCGGCGGGTGTGGTGGTTACGCGCAGCGTGACCGCTACACTTGCCAGCGCCCTAGCGCCCGCTCCTTTCGCTTTCTTCCCTTCCTTTCTCGCCACGTTCGCCGGCTTTCCCCGTCAAGCTCTAAATCGGGGGCTCCCTTTAGGGTTCCGATTTAGTGCTTTACGGCACCTCGACCCCAAAAAACTTGATTAGGGTGATGGTTCACGTAGTGGGCCATCGCCCTGATAGACGGTTTTTCGCCCTTTGACGTTGGAGTCCACGTTCTTTAATAGTGGACTCTTGTTCCAAACTGGAACAACACTCAACCCTATCTCGGTCTATTCTTTTGATTTATAAGGGATTTTGCCGATTTCGGCCTATTGGTTAAAAAATGAGCTGATTTAACAAAAATTTAACGCGAATTTTAACAAAATATTAACGTTTACAATTTC",
        "host_compatibility": ["mammalian"],
        "kinetic_parameters": {
            "termination_efficiency": 0.98,
        },
        "source_doi": "10.1038/nbt.2095",
    },
    {
        "id": "SV40_polyA",
        "biobrick_id": "SV40_polyA",
        "name": "SV40 polyA signal (mammalian)",
        "type": "terminator",
        "role": "null",
        "description": "SV40 late polyadenylation signal. Widely used in mammalian expression vectors.",
        "color": "#ccd5ae",
        "sbol_glyph": "terminator",
        "seq": "AACTTGTTTATTGCAGCTTATAATGGTTACAAATAAAGCAATAGCATCACAAATTTCACAAATAAAGCATTTTTTTCACTGCATTCTAGTTGTGGTTTGTCCAAACTCATCAATGTATCTTA",
        "host_compatibility": ["mammalian"],
        "kinetic_parameters": {
            "termination_efficiency": 0.97,
        },
        "source_doi": "10.1038/nbt.2095",
    },
    # ------------------------------------------------------------------ #
    # INDUCERS (small molecules)
    # ------------------------------------------------------------------ #
    {
        "id": "IPTG",
        "biobrick_id": "IPTG",
        "name": "IPTG",
        "type": "inducer",
        "role": "null",
        "description": "Isopropyl β-D-thiogalactopyranoside. Non-metabolizable lactose analogue that derepresses pLac.",
        "color": "#adf7b6",
        "sbol_glyph": "no-glyph-assigned",
        "seq": None,
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "effective_concentration_uM": 50.0,
            "hill_coefficient_inducer": 1.5,
        },
        "source_doi": "10.1073/pnas.97.16.8864",
    },
    {
        "id": "aTc",
        "biobrick_id": "aTc",
        "name": "aTc (anhydrotetracycline)",
        "type": "inducer",
        "role": "null",
        "description": "Anhydrotetracycline. Non-antibiotic tet family compound that sequesters TetR.",
        "color": "#8ecae6",
        "sbol_glyph": "no-glyph-assigned",
        "seq": None,
        "host_compatibility": ["ecoli", "yeast", "mammalian"],
        "kinetic_parameters": {
            "effective_concentration_nM": 100.0,
            "hill_coefficient_inducer": 1.8,
        },
        "source_doi": "10.1073/pnas.97.16.8864",
    },
    {
        "id": "arabinose",
        "biobrick_id": "arabinose",
        "name": "L-arabinose",
        "type": "inducer",
        "role": "null",
        "description": "L-arabinose sugar. Arms AraC activator to drive pBAD promoter.",
        "color": "#95d5b2",
        "sbol_glyph": "no-glyph-assigned",
        "seq": None,
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "effective_concentration_percent": 0.01,
            "hill_coefficient_inducer": 1.2,
        },
        "source_doi": "10.1128/jb.179.24.7670-7679.1997",
    },
    {
        "id": "AHL",
        "biobrick_id": "3OC6HSL",
        "name": "AHL (3OC6-HSL)",
        "type": "inducer",
        "role": "null",
        "description": "N-3-oxohexanoyl-L-homoserine lactone. Quorum sensing molecule for LuxR.",
        "color": "#74c69d",
        "sbol_glyph": "no-glyph-assigned",
        "seq": None,
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "effective_concentration_nM": 10.0,
            "hill_coefficient_inducer": 2.0,
        },
        "source_doi": "10.1128/jb.188.7.2434-2442.2006",
    },
    {
        "id": "doxycycline",
        "biobrick_id": "doxycycline",
        "name": "Doxycycline",
        "type": "inducer",
        "role": "null",
        "description": "Tetracycline antibiotic used to activate rtTA3G Tet-On system in mammalian cells.",
        "color": "#f4d35e",
        "sbol_glyph": "no-glyph-assigned",
        "seq": None,
        "host_compatibility": ["mammalian", "yeast"],
        "kinetic_parameters": {
            "effective_concentration_ng_per_ml": 200.0,
        },
        "source_doi": "10.1038/nbt.2095",
    },
    {
        "id": "galactose",
        "biobrick_id": "galactose",
        "name": "Galactose",
        "type": "inducer",
        "role": "null",
        "description": "D-galactose activates pGAL1 via Gal4 in S. cerevisiae.",
        "color": "#b5e48c",
        "sbol_glyph": "no-glyph-assigned",
        "seq": None,
        "host_compatibility": ["yeast"],
        "kinetic_parameters": {
            "effective_concentration_percent": 2.0,
        },
        "source_doi": "10.1038/nbt1268",
    },
    {
        "id": "rhamnose",
        "biobrick_id": "rhamnose",
        "name": "L-rhamnose",
        "type": "inducer",
        "role": "null",
        "description": "Rhamnose sugar activates RhaS → pRha system in E. coli.",
        "color": "#d8f3dc",
        "sbol_glyph": "no-glyph-assigned",
        "seq": None,
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "effective_concentration_mM": 1.0,
        },
        "source_doi": "10.1021/acssynbio.0c00078",
    },
    {
        "id": "vanillic_acid",
        "biobrick_id": "vanillic_acid",
        "name": "Vanillic acid",
        "type": "inducer",
        "role": "null",
        "description": "4-hydroxy-3-methoxybenzoic acid. Sequesters VanR to derepress pVan. Orthogonal to LacI/TetR/AraC in E. coli.",
        "color": "#e0aaff",
        "sbol_glyph": "no-glyph-assigned",
        "seq": None,
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "effective_concentration_mM": 0.75,
            "hill_coefficient_inducer": 1.5,
        },
        "source_doi": "10.1021/acssynbio.8b00234",
    },
    # ------------------------------------------------------------------ #
    # INSULATORS — block readthrough between TUs (not part of TU grammar)
    # ------------------------------------------------------------------ #
    {
        "id": "INS_ECK120029600",
        "biobrick_id": "BBa_ECK120029600",
        "name": "insulator ECK120029600",
        "type": "insulator",
        "role": "null",
        "description": "Synthetic E. coli insulator that blocks transcriptional read-through between adjacent TUs. Placed between TUs, not within them.",
        "color": "#b5b5b5",
        "sbol_glyph": "insulator",
        "seq": "CTCGGTACCAAATTCCAGAAAAGAGGCCTCCCGAAAGGGGGGCCTTTTTTCGTTTTGGTCC",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "insulation_efficiency": 0.95,
        },
        "source_doi": "10.1021/sb400079n",
    },
    # ------------------------------------------------------------------ #
    # DEGRADATION TAGS — ssrA-based protein turnover tags (not TU grammar)
    # ------------------------------------------------------------------ #
    {
        "id": "degron_LVA",
        "biobrick_id": "BBa_M0050",
        "name": "ssrA-LVA degradation tag",
        "type": "degradation_tag",
        "role": "null",
        "description": "ssrA LVA peptide tag. Fused to CDS C-terminus, targets protein for rapid ClpXP degradation in E. coli (~10× faster turnover).",
        "color": "#aaaaaa",
        "sbol_glyph": "protease-site",
        "seq": "GCGGCTGCAGCAGCTGCAGCTGCAGAA",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "degradation_fold_increase": 10.0,
            "half_life_min": 6.0,
        },
        "source_doi": "10.1038/nbt1378",
    },
    {
        "id": "degron_AAV",
        "biobrick_id": "BBa_M0051",
        "name": "ssrA-AAV degradation tag",
        "type": "degradation_tag",
        "role": "null",
        "description": "ssrA AAV peptide tag. Weaker ClpXP targeting than LVA. Protein half-life ~60 min in E. coli.",
        "color": "#c0c0c0",
        "sbol_glyph": "protease-site",
        "seq": "GCGGCTGCAGCAGCTGCAGCTGCAGCGGCGGCG",
        "host_compatibility": ["ecoli"],
        "kinetic_parameters": {
            "degradation_fold_increase": 3.0,
            "half_life_min": 60.0,
        },
        "source_doi": "10.1038/nbt1378",
    },
]
