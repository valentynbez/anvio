# -*- coding: utf-8
# pylint: disable=line-too-long
"""
    Classes to define and work with anvi'o contigs workflows.
"""


import anvio
import anvio.terminal as terminal

from anvio.workflows import WorkflowSuperClass
from anvio.workflows.contigs import ContigsDBWorkflow


__author__ = "Developers of anvi'o (see AUTHORS.txt)"
__copyright__ = "Copyleft 2015-2018, the Meren Lab (http://merenlab.org/)"
__credits__ = []
__license__ = "GPL 3.0"
__version__ = anvio.__version__
__maintainer__ = "Alon Shaiber"
__email__ = "alon.shaiber@gmail.com"


run = terminal.Run()
progress = terminal.Progress()


class MetagenomicsWorkflow(ContigsDBWorkflow, WorkflowSuperClass):
    def __init__(self, args, run=terminal.Run(), progress=terminal.Progress()):
        self.args = args
        self.run = run
        self.progress = progress

        # know thyself.
        self.name = 'metagenomics'

        # initialize the base class
        ContigsDBWorkflow.__init__(self)

        self.rules = ['iu_gen_configs', 'iu_filter_quality_minoche', 'gen_qc_report', 'gzip_fastqs',\
                     'fq2fa', 'merge_fastas_for_co_assembly', 'megahit', 'anvi_script_anvi_script_reformat_fasta',\
                     'anvi_gen_contigs_database', 'anvi_export_gene_calls', 'centrifuge',\
                     'anvi_import_taxonomy', 'anvi_run_hmms', 'anvi_run_ncbi_cogs',\
                     'bowtie_build', 'bowtie', 'samtools_view', 'anvi_init_bam',\
                     'anvi_profile', 'annotate_contigs_database', 'anvi_merge']

        rule_acceptable_params_dict = {}

        # defining the accesible params per rule
        rule_acceptable_params_dict['iu_gen_configs'] = ["--r1-prefix", "--r2-prefix"]
        rule_acceptable_params_dict['iu_filter_quality_minoche'] = ['visualize_quality_curves', 'ignore_deflines', 'limit_num_pairs', 'print_qual_scores', 'store_read_fate']
        rule_acceptable_params_dict['gzip_fastqs'] = ["run"]
        rule_acceptable_params_dict['megahit'] = ["--min-contig-len", "--min-count", "--k-min",
                                                  "--k-max", "--k-step", "--k-list",
                                                  "--no-mercy", "--no-bubble", "--merge-level",
                                                  "--prune-level", "--prune-depth", "--low-local-ratio",
                                                  "--max-tip-len", "--no-local", "--kmin-1pass",
                                                  "--presets", "--memory", "--mem-flag",
                                                  "--use-gpu", "--gpu-mem", "--keep-tmp-files",
                                                  "--tmp-dir", "--continue", "--verbose"]
        rule_acceptable_params_dict['bowtie_build'] = []
        rule_acceptable_params_dict['bowtie'] = ["additional_params"]
        rule_acceptable_params_dict['samtools_view'] = ["additional_params"]
        rule_acceptable_params_dict['anvi_init_bam'] = []
        rule_acceptable_params_dict['anvi_profile'] = []
        rule_acceptable_params_dict['annotate_contigs_database'] = []
        rule_acceptable_params_dict['anvi_merge'] = []

        self.rule_acceptable_params_dict = rule_acceptable_params_dict

        self.dirs_dict.update({"QC_DIR": "01_QC",
                               "FASTA_DIR": "02_FASTA",
                               "CONTIGS_DIR": "03_CONTIGS",
                               "MAPPING_DIR": "04_MAPPING",
                               "PROFILE_DIR": "05_ANVIO_PROFILE",
                               "MERGE_DIR": "06_MERGED"})

        self.default_config.update({'megahit': {"--min_contig": 1000, "--memory": 0.4, "threads": 11},
                                    'iu_filter_quality_minoche': {"--ignore-deflines": True, "threads": 2},
                                    "gzip_fastqs": {"run": True},
                                    "bowtie": {"additional_params": "--no-unal", "threads": 10},
                                    "samtools_view": {"additional_params": "-F 4", "threads": 4}})

        self.rules_dependencies.update({'megahit': 'megahit',
                                        'iu_gen_configs': "iu-gen-configs",
                                        'iu_filter_quality_minoche': 'iu-filter-quality-minoche',
                                        'gzip_fastqs': 'gzip'})
