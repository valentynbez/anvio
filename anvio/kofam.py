#!/usr/bin/env python
# -*- coding: utf-8
"""
    This file contains KofamSetup and Kofam classes.

"""

import os
import gzip
import shutil
import requests

import anvio
import anvio.dbops as dbops
import anvio.utils as utils
import anvio.terminal as terminal
import anvio.filesnpaths as filesnpaths

from anvio.errors import ConfigError, FilesNPathsError

__author__ = "Developers of anvi'o (see AUTHORS.txt)"
__copyright__ = "Copyleft 2015-2020, the Meren Lab (http://merenlab.org/)"
__license__ = "GPL 3.0"
__version__ = anvio.__version__
__maintainer__ = "Iva Veseli"
__email__ = "iveseli@uchicago.edu"

run = terminal.Run()
progress = terminal.Progress()
pp = terminal.pretty_print


class KofamContext(object):
    """
    The purpose of this base class is to define shared functions and file paths for all KOfam operations.
    """
    def __init__(self, args):
        A = lambda x: args.__dict__[x] if x in args.__dict__ else None
        # default directory will be called KEGG and will store the KEGG Module data as well
        self.kofam_data_dir = A('kofam_data_dir') or os.path.join(os.path.dirname(anvio.__file__), 'data/misc/KEGG')

        # shared variables for all KOfam subclasses
        self.kofam_hmm_file_path = os.path.join(self.kofam_data_dir, "Kofam.hmm") # file containing concatenated KOfam hmms
        self.ko_list_file_path = os.path.join(self.kofam_data_dir, "ko_list")

        """
        The ko_list file (which is downloaded along with the KOfam HMM profiles) contains important
        information for each KEGG Orthology number (KO, or knum), incuding pre-defined scoring thresholds
        for limiting HMM hits and annotation information.

        It looks something like this:

        knum	threshold	score_type	profile_type	F-measure	nseq	nseq_used	alen	mlen	eff_nseq	re/pos	definition
        K00001	329.57	domain	trim	0.231663	1473	1069	1798	371	17.12	0.590	alcohol dehydrogenase [EC:1.1.1.1]

        Since this information is useful for both the setup process (we need to know all the knums) and HMM process,
        all Kofam subclasses need to have access to this dictionary.

        This is a dictionary (indexed by knum) of dictionaries(indexed by column name).
        Here is an example of the dictionary structure:
        self.ko_dict[K00001][threshold] = 329.57
        """
        self.ko_dict = utils.get_TAB_delimited_file_as_dictionary(self.ko_list_file_path)



class KofamSetup(KofamContext):
    """ Class for setting up KEGG Kofam HMM profiles. It performs sanity checks and downloads, unpacks, and prepares
    the profiles for later use by `hmmscan`.

    Parameters
    ==========
    args: Namespace object
        All the arguments supplied by user to anvi-setup-kegg-kofams
    """

    def __init__(self, args, run=run, progress=progress):
        self.args = args
        self.run = run
        self.progress = progress

        # init the base class
        KofamContext.__init__(self, self.args)

        filesnpaths.is_program_exists('hmmpress')

        if not args.reset and not anvio.DEBUG:
            self.is_database_exists()

        filesnpaths.gen_output_directory(self.kofam_data_dir, delete_if_exists=args.reset)

        # ftp path for HMM profiles and KO list
            # for ko list, add /ko_list.gz to end of url
            # for profiles, add /profiles.tar.gz  to end of url
        self.database_url = "ftp://ftp.genome.jp/pub/db/kofam"
        self.files = ['ko_list.gz', 'profiles.tar.gz']


    def is_database_exists(self):
        """This function determines whether the user has already downloaded the Kofam HMM profiles."""
        if os.path.exists(os.path.join(self.kofam_data_dir, 'profiles/K00001.hmm')): # TODO: update this after determining final structure
            raise ConfigError("It seems you already have KOfam HMM profiles installed in '%s', please use --reset flag if you want to re-download it." % self.kofam_data_dir)

    def download(self):
        """This function downloads the Kofam profiles."""
        self.run.info("Database URL", self.database_url)

        for file_name in self.files:
            utils.download_file(self.database_url + '/' + file_name,
                os.path.join(self.kofam_data_dir, file_name), progress=self.progress, run=self.run)


    def decompress_files(self):
        """This function decompresses the Kofam profiles."""
        for file_name in self.files:
            full_path = os.path.join(self.kofam_data_dir, file_name)

            if full_path.endswith("tar.gz"): # extract tar file instead of doing gzip
                utils.tar_extract_file(full_path, output_file_path = self.kofam_data_dir, keep_original=False)
            else:
                utils.gzip_decompress_file(full_path, keep_original=False)

    def confirm_downloaded_files(self):
        """This function verifies that all Kofam profiles have been properly downloaded. It is intended to be run
        after the files have been decompressed. The profiles directory should contain hmm files from K00001.hmm to
        K23763.hmm with some exceptions."""
        skip_list = [17, 47, 56, 80, 92, 110] # the KO profiles that don't exist, based on ko_list
        for k in range(1,23764): # there is likely a better way to do this. Perhaps we should process the ko_list file into a dict first
            if k not in skip_list:
                hmm_path = os.path.join(self.kofam_data_dir, "profiles/K%05d.hmm" % k)
                if not os.path.exists(hmm_path):
                    raise ConfigError("The KOfam HMM profile at %s does not exist. This probably means that something went wrong \
                                        while downloading the KOfam database. Please run `anvi-setup-kegg-kofams` with the --reset \
                                        flag." % (hmm_path))


    def run_hmmpress(self):
        """This function concatenates the Kofam profiles and runs hmmpress on them."""
        self.progress.new('Preparing Kofam HMM Profiles')
        log_file_path = os.path.join(self.kofam_data_dir, '00_hmmpress_log.txt')

        self.progress.update('Verifying that the Kofam directory at %s contains all HMM profiles' % self.kofam_data_dir)
        self.confirm_downloaded_files()

        self.progress.update('Concatenating HMM profiles into one file...')
        concat_file_path = os.path.join(self.kofam_data_dir, self.kofam_hmm_file) ## this should be a self variable from base class
        utils.concatenate_files(concat_file_path, self.hmm_list, remove_concatenated_files=True) # self.hmm_list should be a self variable from base class

        self.progress.end()

    def setup_profiles(self):
        """This is a driver function which executes the Kofam setup process by downloading, decompressing, and hmmpressing the profiles."""
        self.download()
        self.decompress_files()
        # TODO: set up ko_list dict, file list
        # TODO: add concatenation and hmmpress
