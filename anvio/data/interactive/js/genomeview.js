/**
 * Javascript library for anvi'o genome view
 *
 *  Authors: Isaac Fink <iafink@uchicago.edu>
 *           Matthew Klein <mtt.l.kln@gmail.com>
 *           A. Murat Eren <a.murat.eren@gmail.com>
 *
 * Copyright 2021, The anvi'o project (http://anvio.org)
 *
 * Anvi'o is a free software. You can redistribute this program
 * and/or modify it under the terms of the GNU General Public
 * License as published by the Free Software Foundation, either
 * version 3 of the License, or (at your option) any later version.
 *
 * You should have received a copy of the GNU General Public License
 * along with anvi'o. If not, see <http://opensource.org/licenses/GPL-3.0>.
 *
 * @license GPL-3.0+ <http://opensource.org/licenses/GPL-3.0>
 */

 var VIEWER_WIDTH = window.innerWidth || document.documentElement.clientWidth || document.getElementsByTagName('body')[0].clientWidth;

 var canvas;
 var genomeLabelsCanvas;
 var brush;
 var genomeMax = 0;

 // Settings vars
 // TODO migrate below variables to kvp in state
 var stateData = {};
 var mainCanvasHeight; 
 var spacing = 50; // vertical spacing between genomes
 var yOffset = 0 // vertical space between additional data layers
 var marginTop = 20; // vertical margin at the top of the genome display
 var xDisplacement = 0; // x-offset of genome start, activated if genome labels are shown
 var showLabels = true; // show genome labels?
 var genomeLabelSize = 15; // font size of genome labels
 var showGeneLabels = true; // show gene labels?
 var geneLabelSize = 40; // font size of gene labels
 var labelSpacing = 30;  // spacing default for genomeLabel canvas
 var showScale = true; // show nt scale?
 var scaleInterval = 100; // nt scale intervals
 var dynamicScaleInterval = true; // if true, scale interval automatically adjusts to zoom level
 var scaleFactor = 1; // widths of all objects are scaled by this value to zoom in/out
 var maxGroupSize = 2 // used to calculate group height. base of 2 as each group will contain at minimum a genome layer and scale ruler.

 var alignToGC = null;

 var arrowStyle = 1; // gene arrow cosmetics. 1 (default) = 'inspect-page', 2 = thicker arrows, 3 = pentagon, 4 = rect

 var color_db;
 var cog_annotated = true, kegg_annotated = false;
 // doesn't make sense to iterate through every gene with dozens of genomes...
 // will need to find an efficient way to find these automatically

var genomeData;
var xDisps = {};

$(document).ready(function() {
    initData();
    // loadState();
    processState('default', stateData) // lifted here until loadState is hooked in from backend
    loadAll();
});

function initData() {
// initialize the bulk of the data.
    $.ajax({
        type: 'POST',
        cache: false,
        url: '/data/get_genome_view_data',
        async:false,
        success: function(data) {
            genomeData = data;
            console.log("Saved the following data:");
            console.log(data);

            let genomes = Object.entries(genomeData.genomes) // an array of 2d arrays, where each genome[0] is the object key, and genome[1] is the value
            genomeData.genomes = genomes
        }
    });
}

function loadState(){
  
    $.ajax({
        type: 'GET',
        cache: false,
        url: '/data/genome_view/state/get/' + state_name,
        success: function(response) {
            try{
                // processState(state_name, response[0]); process actual response from backend
                processState(state_name, mockStateData); // process mock state data
            }catch(e){
                console.error("Exception thrown", e.stack);
                toastr.error('Failed to parse state data, ' + e);
                defer.reject();
                return;
            }
            // waitingDialog.hide();
        }
    })
}

function serializeSettings(){
  // TODO same process as the serializeSettings() function for anvi-interactive
  // first we run through all of the UI element default values and store them as state
  // then we update them as necessary below in processState
}

function processState(stateName, stateData){
  calculateMaxGenomeLength()
  
  if(stateData.hasOwnProperty('additional-data-layers')){
    // TODO process     
  } else {
    stateData['additional-data-layers'] = []
    generateMockADL()
  }
  
  // working under the assumption that all genome groups with contain the same additional data layers, 
  // we can query the first genome group for specific ADL and go from there
  if(stateData['additional-data-layers'][0]['coverage']){
    buildAdditionalDataLayersTable('Coverage')
    maxGroupSize += 1 // increase group size if coverage layer exists
  }

  if(stateData['additional-data-layers'][0]['gcContent']){
    buildAdditionalDataLayersTable('GC_Content')
    maxGroupSize += 1 // increase group size if GC layer exists
  }

  if(stateData['additional-data-layers'][0]['ruler']) {
    buildAdditionalDataLayersTable('Genome Ruler')
    // don't increase group size for ruler since it requires less space
  }

  if(stateData.hasOwnProperty('genome-order-method')){
    stateData['genome-order-method'].forEach(orderMethod => {
      $('#genome_order_select').append((new Option(orderMethod["name"], orderMethod["name"]))) // set display + value of new select option.
    })
  } else {
    generateMockGenomeOrder()
    stateData['genome-order-method'].forEach(orderMethod => {
      $('#genome_order_select').append((new Option(orderMethod["name"], orderMethod["name"]))) // set display + value of new select option.
    })
  }

  if(stateData.hasOwnProperty('display')){
    // TODO process
  } else {
    stateData['display'] = {} 
    stateData['display']['additionalDataLayers'] = {}
  }
  if(stateData['display'].hasOwnProperty('bookmarks')){
    stateData['display']['bookmarks'].map(bookmark => {
      $('#bookmarks-select').append((new Option(bookmark['name'], [bookmark["start"], bookmark['stop']])))
    })
    $('#bookmarks-select').change(function(){
      console.log($(this).val());
    })
  } else {
    stateData['display']['bookmarks'] = [ // gen mock data 
      {
        name : 'marky mark',
        start : '5000',
        stop : '9000'
      },
      {
        name : 'marklemore',
        start : '15000',
        stop : '19000'
      },
      {
        name : 'my beautiful cluster',
        start : '25000',
        stop : '29000'
      },
    ]
    stateData['display']['bookmarks'].map(bookmark => {
      $('#bookmarks-select').append((new Option(bookmark['name'], [bookmark["start"], bookmark['stop']])))
    })
    $('#bookmarks-select').change(function(){
      let [start, stop] = [$(this).val().split(',')[0], $(this).val().split(',')[1] ]
      $('#brush_start').val(start);
      $('#brush_end').val(stop);
      brush.extent([start, stop]);
          brush(d3.select(".brush").transition());
          brush.event(d3.select(".brush").transition());   
    })
  }
  

  function generateMockADL(){
    for(let i = 0; i < genomeData.genomes.length; i++){ // generate mock additional data layer content
      let gcContent = []
      let coverage = []
  
      for(let j = 0; j < genomeMax; j++){
        gcContent.push(Math.floor(Math.random() * 45))
        coverage.push(Math.floor(Math.random() * 45))
      }
      let genomeLabel = Object.keys(genomeData.genomes[i][1]['contigs']['info'])[0];
      let additionalDataObject = {
        'genome' : genomeLabel,
        'coverage' : coverage,
        'coverage-color' : 'pink',
        'gcContent' : gcContent,
        'gcContent-color' : 'purple',
        'ruler' : true // TODO: store any genome-specific scale data here
      }
      stateData['additional-data-layers'].push(additionalDataObject)
    }
  }
  function generateMockGenomeOrder(){
    stateData['genome-order-method'] = [{
        'name' : 'cats',
        'ordering' : 'some order'
      }, {
        'name' : 'dogs',
        'ordering' : 'some other order'
      }, {
        'name' : 'birds',
        'ordering' : 'beaks to tails'
    }]
  }
}

function loadAll() {
  buildGenomesTable(genomeData.genomes, 'alphabetical') // hardcode order method until backend order data is hooked in
  canvas = new fabric.Canvas('myCanvas');
  canvas.setWidth(VIEWER_WIDTH * 0.85);

  xDisplacement = showLabels ? 120 : 0;

  // Find max length genome
  calculateMaxGenomeLength()

  var scaleWidth = canvas.getWidth();
  var scaleHeight = 100;

  var xScale = d3.scale.linear().range([0, scaleWidth]).domain([0,genomeMax]);

  var scaleAxis = d3.svg.axis()
              .scale(xScale)
              .tickSize(scaleHeight);

  var scaleArea = d3.svg.area()
              .interpolate("monotone")
              .x(function(d) { return xScale(d); })
              .y0(scaleHeight)
              .y1(0);

  brush = d3.svg.brush()
              .x(xScale)
              .on("brushend", onBrush);

  $("#scaleSvg").attr("width", scaleWidth + 10);

  var scaleBox = d3.select("#scaleSvg").append("g")
              .attr("id", "scaleBox")
              .attr("class","scale")
              .attr("y", 230)
              .attr("transform", "translate(5,0)");

  scaleBox.append("g")
              .attr("class", "x axis top noselect")
              .attr("transform", "translate(0,0)")
              .call(scaleAxis);

  scaleBox.append("g")
              .attr("class", "x brush")
              .call(brush)
              .selectAll("rect")
              .attr("y", 0)
              .attr("height", scaleHeight);

  $('#brush_start').val(0);
  $('#brush_end').val(Math.floor(scaleWidth));

  function onBrush(){
      var b = brush.empty() ? xScale.domain() : brush.extent();

      if (brush.empty()) {
          $('.btn-selection-sequence').addClass('disabled').prop('disabled', true);
      } else {
          $('.btn-selection-sequence').removeClass('disabled').prop('disabled', false);
      }

      b = [Math.floor(b[0]), Math.floor(b[1])];

      $('#brush_start').val(b[0]);
      $('#brush_end').val(b[1]);

      let ntsToShow = b[1] - b[0];
      scaleFactor = canvas.getWidth()/ntsToShow;

      if(dynamicScaleInterval) adjustScaleInterval();

      draw();
      canvas.absolutePan({x: xDisplacement+scaleFactor*b[0], y: 0});

      // TODO: restrict min view to 300 NTs? (or e.g. scaleFactor <= 4)
  }

  $('#tooltip-body').hide() // set initual tooltip hide value
  $('#show_genome_labels_box').attr("checked", showLabels);
  $('#show_gene_labels_box').attr("checked", showGeneLabels);
  $('#show_scale_box').attr("checked", showScale);
  $('#show_dynamic_scale_box').attr("checked", dynamicScaleInterval);

  // can either set arrow click listener on the canvas to check for all arrows, or when arrow is created.

  // disable group selection
  canvas.on('selection:created', (e) => {
    if(e.target.type === 'activeSelection') {
      canvas.discardActiveObject();
    }
  })

  canvas.on('mouse:over', (event) => {
    if(event.target && event.target.id === 'arrow'){
      showToolTip(event)
    }
  })

  canvas.on('mouse:out', (event) => {
    $('#tooltip-body').html('').hide()
  })

  if(showGeneLabels && arrowStyle != 3) {
    marginTop = 60;
    spacing = 200; // TODO maybe we refactor this out into a setSpacing() method for clarity?
    $("#genome_spacing").val(spacing);
  }

  function showToolTip(event){
    $('#tooltip-body').show().append(`
      <p></p>
      <style type="text/css">
        .tftable {font-size:12px;color:#333333;width:100%;border-width: 1px;border-color: #729ea5;border-collapse: collapse;}
        .tftable th {font-size:12px;background-color:#acc8cc;border-width: 1px;padding: 8px;border-style: solid;border-color: #729ea5;text-align:left;}
        .tftable tr {background-color:#d4e3e5;}
        .tftable td {font-size:12px;border-width: 1px;padding: 8px;border-style: solid;border-color: #729ea5;}
        .tftable tr:hover {background-color:#ffffff;}
      </style>

      <table class="tftable" border="1">
        <tr><th>Data</th><th>Value</th></tr>
        <tr><td>Split</td><td>${event.target.gene.contig}</td></tr>
        <tr><td>Start in Contig</td><td>${event.target.gene.start}</td></tr>
        <tr><td>Length</td><td>${event.target.gene.stop - event.target.gene.start}</td></tr>
        <tr><td>Gene Callers ID</td><td>${event.target.geneID}</td></tr>
        <tr><td>Gene Cluster</td><td>${genomeData.gene_associations["anvio-pangenome"] ? genomeData.gene_associations["anvio-pangenome"]["genome-and-gene-names-to-gene-clusters"][event.target.genomeID][event.target.geneID] : "None"}</td></tr>
      </table>
      <button>some action</button>
      <button>some other action</button>
      `).css({'position' : 'absolute', 'left' : event.e.clientX, 'top' : event.e.clientY })
  }

  $('#gene_color_order').append($('<option>', {
    value: 'Source',
    text: 'Source'
  }));
  if(cog_annotated) {
    $('#gene_color_order').append($('<option>', {
      value: 'COG',
      text: 'COG'
    }));
  }
  if(kegg_annotated) {
    $('#gene_color_order').append($('<option>', {
      value: 'KEGG',
      text: 'KEGG'
    }));
  }

  draw();

  // panning
  canvas.on('mouse:down', function(opt) {
    var evt = opt.e;
    if (evt.shiftKey === true) {
      this.isDragging = true;
      this.selection = false;
      this.lastPosX = evt.clientX;
    }
    this.shades = true;
    if(opt.target && opt.target.groupID) this.prev = opt.target.left;
  });
  canvas.on('mouse:move', function(opt) {
    if (this.isDragging) {
      var e = opt.e;
      var vpt = this.viewportTransform;
      vpt[4] += e.clientX - this.lastPosX;
      if(vpt[4] > 125) vpt[4] = 125;
      if(vpt[4] < canvas.getWidth() - genomeMax*scaleFactor - xDisplacement - 125)
      vpt[4] = canvas.getWidth() - genomeMax*scaleFactor - xDisplacement - 125;
      this.requestRenderAll();
      this.lastPosX = e.clientX;
    }
  });
  canvas.on('mouse:up', function(opt) {
    this.setViewportTransform(this.viewportTransform);
    if(this.isDragging) updateScalePos();
    this.isDragging = false;
    this.selection = true;
    if(!this.shades) {
      this.shades = true;
      drawTestShades();
    }
  });
  canvas.on('object:moving', function(opt) {
    var gid = opt.target ? opt.target.groupID : null;
    if(gid == null) return;

    if(opt.target.id == 'genomeLine') canvas.sendToBack(opt.target);
    if(this.shades) {
      clearShades();
      this.shades = false;
    }

    let objs = canvas.getObjects().filter(obj => obj.groupID == gid);

    var delta = opt.target.left - this.prev; //this.previousEvent ? opt.pointer.x - this.previousEvent.pointer.x : opt.e.movementX;
    for(o of objs) {
      if(o === opt.target) continue;
      o.left += delta;
      //o.dirty = true;
    }
    xDisps[gid] += delta;
    //canvas.renderAll();
    this.setViewportTransform(this.viewportTransform);
    //this.previousEvent = opt;
    this.prev = opt.target.left;
  });
  canvas.on('mouse:wheel', function(opt) {
    opt.e.preventDefault();
    opt.e.stopPropagation();

    var delta = opt.e.deltaY;
    let tmp = scaleFactor * (0.999 ** delta);
    let diff = tmp - scaleFactor;
    let [start, end] = [parseInt($('#brush_start').val()), parseInt($('#brush_end').val())];
    let [newStart, newEnd] = [Math.floor(start - diff*genomeMax), Math.floor(end + diff*genomeMax)];
    if(newStart < 0) newStart = 0;
    if(newEnd > genomeMax) newEnd = genomeMax;
    if(newEnd - newStart < 50) return;
    
    brush.extent([newStart, newEnd]);
    brush(d3.select(".brush").transition()); // if zoom is slow or choppy, try removing .transition()
    brush.event(d3.select(".brush"));
    $('#brush_start').val(newStart);
    $('#brush_end').val(newEnd);
  });

  $('#alignClusterInput').on('keydown', function(e) {
    if(e.keyCode == 13) { // 13 = enter key
      alignToCluster($(this).val());
      $(this).blur();
    }
  });
  $('#panClusterInput').on('keydown', function(e) {
    if(e.keyCode == 13) { // 13 = enter key
      viewCluster($(this).val());
      $(this).blur();
    }
  });
  document.body.addEventListener("keydown", function(ev) {
    if(ev.which == 83 && ev.target.nodeName !== 'TEXTAREA' && ev.target.nodeName !== 'INPUT') { // S = 83
      toggleSettingsPanel();
    }
  });
  $('#genome_spacing').on('keydown', function(e) {
    if(e.keyCode == 13) { // 13 = enter key
      setGenomeSpacing($(this).val());
      $(this).blur();
    }
  });
  $('#gene_label').on('keydown', function(e) {
    if(e.keyCode == 13) { // 13 = enter key
      setGeneLabelSize($(this).val());
      $(this).blur();
    }
  });
  $('#genome_label').on('keydown', function(e) {
    if(e.keyCode == 13) { // 13 = enter key
      setGenomeLabelSize($(this).val());
      $(this).blur();
    }
  });
  $('#genome_scale_interval').on('keydown', function(e) {
    if(e.keyCode == 13) { // 13 = enter key
      setScale($(this).val());
      $(this).blur();
    }
  });
  $('#gene_color_order').on('change', function() {
      color_db = $(this).val();
      draw();
      $(this).blur();
  });
  $('#arrow_style').on('change', function() {
      arrowStyle = parseInt($(this).val());
      draw();
      $(this).blur();
  });
  $('#show_genome_labels_box').on('change', function() {
    showLabels = !showLabels;
    xDisplacement = showLabels ? 120 : 0;
    alignToGC = null;
    draw();
  });
  $('#show_gene_labels_box').on('change', function() {
    showGeneLabels = !showGeneLabels;
    draw();
  });
  $('#show_scale_box').on('change', function() {
    showScale = !showScale;
    draw();
  });
  $('#show_dynamic_scale_box').on('change', function() {
    dynamicScaleInterval = !dynamicScaleInterval;
  });
  $('#brush_start, #brush_end').keydown(function(ev) {
      if (ev.which == 13) { // enter key
          let start = parseInt($('#brush_start').val());
          let end = parseInt($('#brush_end').val());

          if (isNaN(start) || isNaN(end) || start < 0 || start > genomeMax || end < 0 || end > genomeMax) {
              alert(`Invalid value, value needs to be in range 0-${genomeMax}.`);
              return;
          }

          if (start >= end) {
              alert('Starting value cannot be greater or equal to the ending value.');
              return;
          }

          brush.extent([start, end]);
          brush(d3.select(".brush").transition());
          brush.event(d3.select(".brush").transition());
      }
  });
}

function draw(scaleX=scaleFactor) {
  canvas.clear()
  labelSpacing = 30 // reset to default value upon each draw() call
  yOffset = 0 // reset 
  var y = marginTop;
  canvas.setHeight(calculateMainCanvasHeight()) // set canvas height dynamically


  for(genome of genomeData.genomes) {
    let label = genome[1].genes.gene_calls[0].contig;
    xDisps[genome[0]] = xDisplacement;
    addGenome(label, genome[1].genes.gene_calls, genome[0], y, scaleX=scaleX)
    addLayers(label, genome[1], genome[0])
    labelSpacing += 30
    y+=spacing;
  }
  //drawScale(y);
  checkGeneLabels();
  drawTestShades();
}

function drawScale(y, scaleX=scaleFactor) {
  if(!showScale) return;

  for(var w = 0; w < genomeMax; w+=scaleInterval) {
    canvas.add(new fabric.Line([0,0,0,20], {left: (w*scaleX+xDisplacement),
          top: y,
          stroke: 'black',
          strokeWidth: 1,
          fontSize: 10,
          fontFamily: 'sans-serif',
          selectable: false}));

    canvas.add(new fabric.Text(w/1000 + " kB", {left: (w*scaleX+5+xDisplacement),
          top: y,
          stroke: 'black',
          strokeWidth: .25,
          fontSize: 15,
          fontFamily: 'sans-serif',
          selectable: false}));
  }

  canvas.add(new fabric.Line([0,0,100,0], {left: xDisplacement,
        top: (1.25*y)-4,
        stroke: 'black',
        strokeWidth: 2,
        selectable: false}));
  canvas.add(new fabric.Text("100 nts", {left: (15+xDisplacement),
        top: (1.25*y)-4,
        stroke: 'black',
        strokeWidth: 1,
        fontSize: 20,
        fontFamily: 'sans-serif',
        selectable: false}));
}

function zoomIn() {
  let start = parseInt($('#brush_start').val()), end = parseInt($('#brush_end').val());
  let newStart, newEnd;

  let len = end - start;
  if(len > 4*genomeMax/50) {
    newStart = Math.floor(start + genomeMax/50), newEnd = Math.floor(end - genomeMax/50);
  } else {
    if(len < 50) return;
    newStart = Math.floor(start + len/4);
    newEnd = Math.floor(end - len/4);
    if(newEnd - newStart <= 0) return;
  }

  brush.extent([newStart, newEnd]);
  brush(d3.select(".brush").transition());
  brush.event(d3.select(".brush").transition());
}

function zoomOut() {
  let start = parseInt($('#brush_start').val()), end = parseInt($('#brush_end').val());

  let newStart = start - genomeMax/50, newEnd = end + genomeMax/50;
  if(newStart == 0 && newEnd == genomeMax) { // for extra-zoomed-out view
    scaleFactor = 0.01;
    if(dynamicScaleInterval) adjustScaleInterval();
  draw();
    return;
  }
  if(newStart < 0) newStart = 0;
  if(newEnd > genomeMax) newEnd = genomeMax;

  brush.extent([newStart, newEnd]);
  brush(d3.select(".brush").transition());
  brush.event(d3.select(".brush").transition());
}

/*
 *  Draw background shades between genes of the same cluster.
 *  TODO: generalize this function to take in [start,stop,val] NT sequence ranges to shade any arbitrary metric
 *        - add a separate function for retrieving [start,stop,val] given gene cluster IDs
 *
 *  @param geneClusters : array of GC IDs to be shaded
 *  @param colors       : dict defining color of each shade, in the form {geneClusterID : hexColor}
 */
function shadeGeneClusters(geneClusters, colors) {
  if(!genomeData.gene_associations["anvio-pangenome"]) return;

  let y = marginTop;
  for(var i = 0; i < genomeData.genomes.length-1; i++) {
    let genomeA = genomeData.genomes[i][1].genes.gene_calls;
    let genomeB = genomeData.genomes[i+1][1].genes.gene_calls;
    let genomeID_A = genomeData.genomes[i][0];
    let genomeID_B = genomeData.genomes[i+1][0];

    for(gc of geneClusters) {
      let g1 = [], g2 = [];
      for(geneID of genomeData.gene_associations["anvio-pangenome"]["gene-cluster-name-to-genomes-and-genes"][gc][genomeID_A]) {
        g1.push(genomeA[geneID].start, genomeA[geneID].stop);
      }
      for(geneID of genomeData.gene_associations["anvio-pangenome"]["gene-cluster-name-to-genomes-and-genes"][gc][genomeID_B]) {
        g2.push(genomeB[geneID].start, genomeB[geneID].stop);
      }

      g1 = g1.map(val => val*scaleFactor + xDisps[genomeID_A]);
      g2 = g2.map(val => val*scaleFactor + xDisps[genomeID_B]);

      /* TODO: implementation for multiple genes of the same genome in the same gene cluster */
      var path = new fabric.Path("M " + g1[0] + " " + y + " L " + g1[1] + " " + y + " L " + g2[1] + " " + (y+spacing) + " L " + g2[0] + " " + (y+spacing) + " z", {
        id: 'link',
        fill: colors[gc],
        opacity: 0.25,
        selectable: false
      });
      path.sendBackwards();
      canvas.sendToBack(path);
    }
    y += spacing
  }
}

/*
 *  Clear all gene links from the canvas.
 */
function clearShades() {
  canvas.getObjects().filter(obj => obj.id == 'link').forEach((l) => { canvas.remove(l) });
}

/*
 *  Temporary function for testing shades.
 */
function drawTestShades() {
  shadeGeneClusters(["GC_00000034","GC_00000097","GC_00000002"],{"GC_00000034":"green","GC_00000097":"red","GC_00000002":"purple"});
}

/*
 *  Show/hide gene labels to show the max amount possible s.t. none overlap.
 */
function checkGeneLabels() {
  var labels = canvas.getObjects().filter(obj => obj.id == 'geneLabel');
  for(var i = 0; i < labels.length-1; i++) {
    if(arrowStyle == 3) {
      // hide labels that don't fit inside pentagon arrows
      if(labels[i].width/2 > canvas.getObjects().filter(obj => obj.id == 'arrow')[i].width) {
        labels[i].visible = false;
        continue;
      }
      labels[i].visible = true;
    }
    var p = i+1;
    while(p < labels.length && labels[i].intersectsWithObject(labels[p])) {
      labels[p].visible = false;
      p++;
    }
    if(p == labels.length) return;
    labels[p].visible = true;
    i = p - 1;
  }
}

/*
 *  Shift genomes horizontally to align genes around the target gene cluster.
 *
 *  @param gc : target gene cluster ID
 */
function alignToCluster(gc) {
  if(!genomeData.gene_associations["anvio-pangenome"]) return;

  let [firstGenomeID, targetGeneMid] = viewCluster(gc);
  if(firstGenomeID != null) {
    alignToGC = gc;
    let index = genomeData.genomes.findIndex(g => g[0] == firstGenomeID);
    for(var i = index+1; i < genomeData.genomes.length; i++) {
      let genomeID = genomeData.genomes[i][0];
      let geneMids = getGenePosForGenome(genomeData.genomes[i][0], alignToGC);
      if(geneMids == null) continue;
      let geneMid = geneMids[0]; /* TODO: implementation for multiple matching gene IDs */
      let shift = scaleFactor * (targetGeneMid - geneMid) + (xDisps[firstGenomeID] - xDisps[genomeID]);
      let gid = genomeData.genomes[i][0];
      let objs = canvas.getObjects().filter(obj => obj.groupID == gid);
      for(o of objs) o.left += shift;
      xDisps[genomeID] += shift;
      canvas.setViewportTransform(canvas.viewportTransform);

      // clear and redraw shades
      clearShades();
      drawTestShades();
    }
  } else {
    console.log('Warning: ' + gc + ' is not a gene cluster in data structure');
  }
  // draw();
    }

/*
 * Pan viewport to the first gene in the target gene cluster.
 *
 * @param gc : target gene cluster ID
 * @returns tuple [a,b] where
 *  a is genomeID of the first genome containing `gc` and
 *  b is NT position of the middle of the target gene
*/
function viewCluster(gc) {
  if(!genomeData.gene_associations["anvio-pangenome"]) return;

  let genes = [];
  let geneMid;
  let first = true;
  let firstGenomeID;

  if(!gc || gc in genomeData.gene_associations["anvio-pangenome"]["gene-cluster-name-to-genomes-and-genes"]) {
    for(genome of genomeData.genomes) {
      var targetGenes = getGenesOfGC(genome[0], gc);
      if(targetGenes == null) continue;
      var targetGeneID = targetGenes[0]; /* TODO: implementation for multiple matching gene IDs */
      var targetGene = genome[1].genes.gene_calls[targetGeneID];
      genes.push({genomeID:genome[0],geneID:targetGeneID});

      if(first) {
        geneMid = targetGene.start + (targetGene.stop - targetGene.start) / 2;
      canvas.absolutePan({x: scaleFactor*geneMid + xDisplacement - canvas.getWidth()/2, y: 0});
      canvas.viewportTransform[4] = clamp(canvas.viewportTransform[4], canvas.getWidth() - genomeMax*scaleFactor - xDisplacement - 125, 125);
      updateScalePos();
        first = false;
        firstGenomeID = genome[0];
      }
    }
    glowGenes(genes);
    return (first ? null : [firstGenomeID, geneMid]);
  } else {
    console.log('Warning: ' + gc + ' is not a gene cluster in data structure');
  return null;
}
}

/*
 *  @returns NT position of the middle of each gene in a given genome with a specified gene cluster
 */
function getGenePosForGenome(genomeID, gc) {
  var targetGenes = getGenesOfGC(genomeID, gc);
  if(targetGenes == null) return null;

  let genome = genomeData.genomes.find(g => g[0] == genomeID);
  let mids = [];
  for(geneID of targetGenes) {
    let gene = genome[1].genes.gene_calls[geneID];
    let geneMid = gene.start + (gene.stop - gene.start) / 2;
    mids.push(geneMid);
  }
  return mids;
}

/*
 *  @returns array of geneIDs in a given genome with a specified gene cluster
 */
function getGenesOfGC(genomeID, gc) {
  var targetGenes = genomeData.gene_associations["anvio-pangenome"]["gene-cluster-name-to-genomes-and-genes"][gc][genomeID];
  return targetGenes.length > 0 ? targetGenes : null;
}

/*
 *  Add a temporary glow effect around given gene(s).
 *
 *  @param geneParams : array of dicts, in one of two formats:
 *    (1) [{genomeID: gid_1, geneID: [id_1, id_2, ...]}, ...]
 *    (2) [{genomeID: gid_1, geneID: id_1}, ...]
 */
function glowGenes(geneParams) {
  // convert geneParams format (1) to format (2)
  if(Array.isArray(geneParams[0].geneID)) {
    let newParams = [];
    for(genome of geneParams) {
      for(gene of genome.geneID) newParams.push({genomeID:genome.genomeID, geneID:gene});
    }
    geneParams = newParams;
  }

  var shadow = new fabric.Shadow({
    color: 'red',
    blur: 30
  });
  var arrows = canvas.getObjects().filter(obj => obj.id == 'arrow' && geneParams.some(g => g.genomeID == obj.genomeID && g.geneID == obj.geneID));
  for(arrow of arrows) {
    arrow.set('shadow', shadow);
    arrow.animate('shadow.blur', 0, {
      duration: 3000,
      onChange: canvas.renderAll.bind(canvas),
      onComplete: function(){ arrow.shadow = null; },
      easing: fabric.util.ease['easeInQuad']
    });
  }
  canvas.renderAll();
}

function setGenomeSpacing(newSpacing) {
  if(isNaN(newSpacing)) return;
  newSpacing = parseInt(newSpacing);
  if(newSpacing < 0 || newSpacing > 1000) {
    alert(`Invalid value, genome spacing must be in range 0-1000.`);
    return;
  }
  spacing = newSpacing;
  draw();
}

function setScale(newScale) {
  if(isNaN(newScale)) return;
  newScale = parseInt(newScale);
  if(newScale < 50) {
    alert(`Invalid value, scale interval must be >=50.`);
    return;
  }
  scaleInterval = newScale;
  draw();
}

function setGeneLabelSize(newSize) {
  if(isNaN(newSize)) return;
  newSize = parseInt(newSize);
  if(newSize < 0 || newSize > 1000) {
    alert(`Invalid value, gene label size must be in range 0-1000.`);
    return;
  }
  geneLabelSize = newSize;
  if(showGeneLabels) draw();
}

function setGenomeLabelSize(newSize) {
  if(isNaN(newSize)) return;
  newSize = parseInt(newSize);
  if(newSize < 0 || newSize > 1000) {
    alert(`Invalid value, genome label size must be in range 0-1000.`);
    return;
  }
  genomeLabelSize = newSize;
  if(showLabels) draw();
}

function addGenome(genomeLabel, gene_list, genomeID, y, scaleX=1) {
  if(showLabels) {
    canvas.add(new fabric.Text(genomeLabel, {top: y-5, selectable: false, fontSize: genomeLabelSize, fontFamily: 'sans-serif', fontWeight: 'bold'}));
  }

  // line
  let lineObj = new fabric.Line([0,0,genomeMax*scaleX,0], {
        id: 'genomeLine',
        groupID: genomeID,
        left: xDisplacement,
        top: y + 4,
        stroke: 'black',
        strokeWidth: 2,
        lockMovementY: true,
        hasControls: false,
        hasBorders: false,
        lockScaling: true});
  canvas.add(lineObj);

  for(let geneID in gene_list) {
    let gene = gene_list[geneID];
    let genome = genomeData.genomes.find(g => g[0] == genomeID)[1];
    var geneObj = geneArrow(gene,geneID,genome.genes.functions[geneID],y,genomeID,arrowStyle,scaleX=scaleX);
    canvas.add(geneObj);

    if(showGeneLabels) {
      var label = new fabric.IText("geneID: "+geneID, {
        id: 'geneLabel',
        groupID: genomeID,
        fontSize: geneLabelSize,
        hasControls: false,
        lockMovementX: true,
        lockMovementY: true,
        lockScaling: true,
        hoverCursor: 'text'
      });

      if(arrowStyle == 3) {
        label.set({
          top: y-5,
          left: xDisplacement+(gene.start+50)*scaleX,
          scaleX: 0.5,
          scaleY: 0.5,
          selectionColor:'rgba(128,128,128,.5)'
        });
      } else {
        label.set({
          scaleX: 0.5,
          scaleY: 0.5,
          top: y-30,
          left: xDisplacement+(gene.start+50)*scaleX,
          angle: -10,
          selectionColor:'rgba(128,128,128,.2)'
        });
      }
      canvas.add(label);
    }
  }
}

function addLayers(label, genome, genomeID){ // this will work alongside addGenome to render out any additional data layers associated with each group (genome)
  let additionalDataLayers;
  stateData['additional-data-layers'].map(group => {
    if(group.genome == label){
      additionalDataLayers = group
    }
  })

  if(additionalDataLayers['ruler']) {
    let startingTop = marginTop + yOffset + 30
    let startingLeft = xDisps[genomeID]

    let ruler = new fabric.Group();
    for(let w = 0; w < genomeMax; w+=scaleInterval) {
      let tick = new fabric.Line([0,0,0,20], {left: (w*scaleFactor),
            stroke: 'black',
            strokeWidth: 1,
            fontSize: 10,
            fontFamily: 'sans-serif'});
      let lbl = new fabric.Text(w/1000 + " kB", {left: (w*scaleFactor+5),
            stroke: 'black',
            strokeWidth: .25,
            fontSize: 15,
            fontFamily: 'sans-serif'});
      ruler.add(tick);
      ruler.add(lbl);
    }
    ruler.set({
      left: startingLeft,
      top: startingTop,
      lockMovementY: true,
      hasControls: false,
      hasBorders: false,
      lockScaling: true,
      objectCaching: false,
      groupID: genomeID
    });
    ruler.addWithUpdate();
    canvas.add(ruler);
  }

  if(additionalDataLayers['coverage']){
    let maxCoverageValue = 0
    let startingTop = marginTop + yOffset + 60
    let startingLeft = xDisps[genomeID]
    let layerHeight = 50
    let pathDirective = [`M 0 0`]

    for(let i = 0; i < additionalDataLayers['coverage'].length; i++){
      additionalDataLayers['coverage'][i] > maxCoverageValue ? maxCoverageValue = additionalDataLayers['coverage'][i] : null 
    }

    for(let i = 0; i < 1000; i++){
      let left = i * scaleFactor
      let top = [additionalDataLayers['coverage'][i] / maxCoverageValue] * layerHeight
      let segment = `L ${left} ${top}`
      pathDirective.push(segment)
    }

    let graphObj = new fabric.Path(pathDirective.join(' '))
    graphObj.set({
      top : startingTop,
      left : startingLeft,
      stroke : additionalDataLayers['coverage-color'] ? additionalDataLayers['coverage-color'] : 'black',
      fill : '', //additionalDataLayers['coverage-color'] ? additionalDataLayers['coverage-color'] : 'black',
      lockMovementY: true,
      hasControls: false,
      hasBorders: false,
      lockScaling: true,
      id : 'coverage graph', 
      groupID : genomeID,
      genome : additionalDataLayers['genome']
    })
    canvas.bringToFront(graphObj)
  } 

  if(additionalDataLayers['gcContent']){
    let maxGCValue = 0
    let startingTop = marginTop + yOffset + 120
    let startingLeft = xDisps[genomeID]
    let layerHeight = 50
    let pathDirective = [`M 0 0`]

    for(let i = 0; i < additionalDataLayers['gcContent'].length; i++){ 
      additionalDataLayers['gcContent'][i] > maxGCValue ? maxGCValue = additionalDataLayers['gcContent'][i] : null 
    }

    for(let i = 0; i < 1000; i++){ // 
      let left = i * scaleFactor
      let top = [additionalDataLayers['gcContent'][i] / maxGCValue] * layerHeight
      let segment = `L ${left} ${top}`
      pathDirective.push(segment)
    }
    
    let graphObj = new fabric.Path(pathDirective.join(' '))
    graphObj.set({
      top : startingTop,
      left : startingLeft,
      stroke : additionalDataLayers['gcContent-color'] ? additionalDataLayers['gcContent-color'] : 'black',
      fill : '', //additionalDataLayers['gcContent-color'] ? additionalDataLayers['gcContent-color'] : 'black',
      lockMovementY: true,
      hasControls: false,
      hasBorders: false,
      lockScaling: true,
      id : 'gcContent graph', 
      groupID : genomeID,
      genome : additionalDataLayers['genome']
    })
    canvas.bringToFront(graphObj)
  } 

  yOffset += spacing
}

function geneArrow(gene, geneID, functions, y, genomeID, style, scaleX=1) {
  var cag = null;
  var color = 'gray';
  if(functions) {
    switch(color_db) {
      case 'COG':
        if(functions["COG_CATEGORY"]) cag = functions["COG_CATEGORY"][1];
        color = cag in default_COG_colors ? default_COG_colors[cag] : 'gray';
        break;
      case 'KEGG':
        if(functions.hasOwnProperty("KEGG_Class") && functions.KEGG_Class != null) {
          cag = getCategoryForKEGGClass(functions["KEGG_Class"][1]);
        }
        color = cag in default_KEGG_colors ? default_KEGG_colors[cag] : 'gray';
        break;
      default:
        if (gene.source.startsWith('Ribosomal_RNA')) {
          cag = 'rRNA';
        } else if (gene.source == 'Transfer_RNAs') {
          cag = 'tRNA';
        } else if (gene.functions !== null) {
          cag = 'Function';
        }
        color = cag in default_source_colors ? default_source_colors[cag] : 'gray';
    }
  }
  /* Issue here: each genome might be differentially annotated... how to make sure all have COG annotations for example? */

  let length = (gene.stop-gene.start)*scaleX;
  let stemLength = length-25 > 0 ? length-25 : 0;

  var arrowPathStr;
  switch(style) {
    case 2: // thicker arrows
      arrowPathStr = 'M ' + stemLength + ' -5 L 0 -5 L 0 15 L ' + stemLength + ' 15 L ' + stemLength + ' 15 L ' + stemLength + ' 20 L ' + length + ' 5 L ' + stemLength + ' -10 z';
      break;
    case 3: // pentagon arrows
      arrowPathStr = 'M 0 0 L ' + stemLength + ' 0 L ' + length + ' 20 L ' + stemLength + ' 40 L 0 40 L 0 0 z';
      break;
    case 4: // rect arrows
      arrowPathStr = 'M ' + length + ' -5 L 0 -5 L 0 15 L ' + length + ' 15 z';
      break;
    default: // 'inspect page' arrows
      arrowPathStr = 'M ' + stemLength + ' 0 L 0 0 L 0 10 L ' + stemLength + ' 10 L ' + stemLength + ' 10 L ' + stemLength + ' 20 L ' + length + ' 5 L ' + stemLength + ' -10 z';
      break;
  }

  var arrow = new fabric.Path(arrowPathStr);
  arrow.set({
    id: 'arrow',
    groupID: genomeID,
    lockMovementY: true,
    hasControls: false,
    hasBorders: false,
    lockScaling: true,
    gene: gene,
    geneID: geneID,
    genomeID: genomeID,
    top: style == 3 ? y-17 : y-11,
    left: xDisplacement + (1.5+gene.start)*scaleX,
    fill: color,
    stroke: 'gray',
    strokeWidth: style == 3 ? 3 : 1.5
  });
  if(gene.direction == 'r') arrow.rotate(180);

  return arrow;
}

function toggleSettingsPanel() {
    $('#settings-panel').toggle();

    if ($('#settings-panel').is(':visible')) {
        $('#toggle-panel-settings').addClass('toggle-panel-settings-pos');
        $('#toggle-panel-settings-inner').html('&#9658;');
    } else {
        $('#toggle-panel-settings').removeClass('toggle-panel-settings-pos');
        $('#toggle-panel-settings-inner').html('&#9664;');
    }
}

function getCategoryForKEGGClass(class_str) {
  if(class_str == null) return null;

  var category_name = getClassFromKEGGAnnotation(class_str);
  return getKeyByValue(KEGG_categories, category_name);
}

function getClassFromKEGGAnnotation(class_str) {
  return class_str.substring(17, class_str.indexOf(';', 17));
}

// https://stackoverflow.com/questions/9907419/how-to-get-a-key-in-a-javascript-object-by-its-value/36705765
function getKeyByValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function resetScale(){
  canvas.setZoom(1)
}

function buildGenomesTable(genomes, order){
  genomes.map(genome => {
    var height = '50';
    var margin = '15';
    var template = '<tr id={genomeLabel}>' +
                  '<td><img src="images/drag.gif" class="drag-icon" id={genomeLabel} /></td>' +
                  '<td> {genomeLabel} </td>' +
                  '<td>n/a</td>' +
                  '<td>n/a</td>' +
                  '<td>n/a</td>' +
                  '<td><input class="input-height" type="text" size="3" id="height{id}" value="{height}"></input></td>' +
                  '<td class="column-margin"><input class="input-margin" type="text" size="3" id="margin{id}" value="{margin}"></input></td>' +
                  '<td>n/a</td>' +
                  '<td>n/a</td>' +
                  '<td><input type="checkbox" class="layer_selectors"></input></td>' +
                  '</tr>';
    let genomeLabel= Object.keys(genome[1]['contigs']['info']);

    template = template.replace(new RegExp('{height}', 'g'), height)
                       .replace(new RegExp('{margin}', 'g'), margin)
                       .replace(new RegExp('{genomeLabel}', 'g'), genomeLabel);

    $('#tbody_genomes').append(template);
  })

  $("#tbody_genomes").sortable({helper: fixHelperModified, handle: '.drag-icon', items: "> tr"}).disableSelection();

  $("#tbody_genomes").on("sortupdate", (event, ui) => {
    changeGenomeOrder($("#tbody_genomes").sortable('toArray'))
  })
}

function buildAdditionalDataLayersTable(layerLabel){
  var height = '50'; 
  var margin = '25'; 
  var template = '<tr id={layerLabel}>' +
                  '<td> {layerLabel} </td>' +
                  '<td><div id="{layerLabel}_color" style="margin-left: 5px;" class="colorpicker" style="background-color: #FFFFFF" color="#FFFFFF"></div></td>' +
                  '<td>n/a</td>' +
                  '<td>n/a</td>' +
                  '<td><input type="checkbox" class="additional_selectors" id={layerLabel}-show onclick="toggleAdditionalDataLayer(event)" checked=true></input></td>' +
                  '</tr>'; 
  template = template.replace(new RegExp('{height}', 'g'), height)
                     .replace(new RegExp('{margin}', 'g'), margin)
                     .replace(new RegExp('{layerLabel}', 'g'), layerLabel);   
  $('#tbody_additionalDataLayers').append(template);
}

function toggleAdditionalDataLayer(e){
  let layer = e.target.id.split('-')[0]

  if(e.target.checked){
    stateData['display']['additionalDataLayers'][layer] = true
    maxGroupSize += 1 
  } else {
    stateData['display']['additionalDataLayers'][layer] = false
    maxGroupSize -= 1 // decrease group height if hiding the layer
  }
  draw()
}

function changeGenomeOrder(updatedOrder){
  let newGenomeOrder = []
  updatedOrder.map(label => {
    genomeData.genomes.map(genome => {
        if(label == Object.keys(genome[1]['contigs']['info'])[0]){ // matching label text to first contig name of each genome
          newGenomeOrder.push(genome)
        }
    })
  })
  genomeData.genomes = newGenomeOrder
  draw()
}

/*
 *  Save NT length of the largest genome in `genomeMax`.
 */
function calculateMaxGenomeLength(){
  for(genome of genomeData.genomes) {
    genome = genome[1].genes.gene_calls;
    let genomeEnd = genome[Object.keys(genome).length-1].stop;
    if(genomeEnd > genomeMax) genomeMax = genomeEnd;
  }
}

function calculateMainCanvasHeight(){ // to be used for setting vertical spacing
  let optimalLayerHeight = 50 // arbitrary value to be set by us experts ;) 
  let additionalSpacing = 100 // arbitrary additional spacing for ruler(s), cosmetics
  let mainCanvasHeight = optimalLayerHeight * maxGroupSize * genomeData.genomes.length + additionalSpacing
  return mainCanvasHeight
}

/*
 *  Dynamically set scale tick interval based on scaleFactor.
 */
function adjustScaleInterval() {
  let val = Math.floor(100/scaleFactor);
  let roundToDigits = Math.floor(Math.log10(val)) - 1;
  let newInterval = Math.floor(val/(10**roundToDigits)) * (10**roundToDigits);
  scaleInterval = newInterval;
  $('#genome_scale_interval').val(scaleInterval);
}

/*
 *  Update scale box position to match viewport location.
 */
function updateScalePos() {
  let [start, end] = [parseInt($('#brush_start').val()), parseInt($('#brush_end').val())];
  let newStart = Math.floor(-1*(canvas.viewportTransform[4]+xDisplacement)/scaleFactor);
  let newEnd = newStart + (end-start);
  if(newStart < 0) {
    newStart = 0;
    newEnd = end - start;
  } else if(newEnd > genomeMax) {
    newEnd = genomeMax;
    newStart = start + (genomeMax - end);
  }
  brush.extent([newStart, newEnd]);
  brush(d3.select(".brush").transition());
  $('#brush_start').val(newStart);
  $('#brush_end').val(newEnd);
}

function createBookmark(){
  if(!$('#create_bookmark_input').val()){
    alert('please provide a name for your bookmark :)')
    return 
  }
  
  stateData['display']['bookmarks'].push(
    {
      name : $('#create_bookmark_input').val(), 
      start : $('#brush_start').val(), 
      stop : $('#brush_end').val(), 
    }
  )
}

var fixHelperModified = function(e, tr) { // ripped from utils.js instead of importing the whole file
  var $originals = tr.children();
  var $helper = tr.clone();
  $helper.children().each(function(index) {
      $(this).width($originals.eq(index).width());
  });
  return $helper;
};
