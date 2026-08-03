(async function () {

const html = `

  <!-- div class="uk-container" -->

  <div class="uk-container-fluid uk-margin-medium-left uk-margin-small-top">
  <form class="uk-form-horizontal">
    <div>
      <label class="uk-form-label">Dwell Time Start (minutes)</label>
      <div class="uk-form-controls uk-form-controls-number">

      <form method="GET" action="">
        <input type="hidden" name="station" id="FRM_STATION">
        <input type="hidden" name="cycle" id="FRM_CYCLE">

        <input class="uk-input uk-form-width-medium" type="number" id="dwell-time-start" name="start" value="0">
        <button class="uk-button" id="dwell-time-btn" type="submit">Update Dwelling Time</button>
      </form>

      </div>
    </div>
  </form>
  </div>

    <ul id="clusters" class="uk-grid uk-child-width-1-6@s" uk-grid>
      
    </ul>
  <!-- /div -->

  <div id="offcanvas-usage" uk-offcanvas>
    <div class="uk-offcanvas-bar">

      <button class="uk-offcanvas-close" type="button" uk-close></button>

      <h3>Dwelling Packages</h3>
      
      <a href="javascript:void(0)" id="print-btn">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" height="25" width="25"><!--! Font Awesome Pro 6.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path style="fill: #FFF" d="M128 0C92.7 0 64 28.7 64 64v96h64V64H354.7L384 93.3V160h64V93.3c0-17-6.7-33.3-18.7-45.3L400 18.7C388 6.7 371.7 0 354.7 0H128zM384 352v32 64H128V384 368 352H384zm64 32h32c17.7 0 32-14.3 32-32V256c0-35.3-28.7-64-64-64H64c-35.3 0-64 28.7-64 64v96c0 17.7 14.3 32 32 32H64v64c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V384zm-16-88c-13.3 0-24-10.7-24-24s10.7-24 24-24s24 10.7 24 24s-10.7 24-24 24z"/></svg>
      </a>

      <table id="tba-table" class="uk-table uk-table-divider">
        <thead>
          <tr>
            <th>Location</th>
            <th># TBA's</th>
          </tr>
        </thead>
        <tbody>

        </tbody>
      </table>

    </div>
  </div>

  <div class="uk-hidden" id="tba-tmpl">
    <table>
      <tr class="sort-zone-tba">
        <td class="sort-zone"></td>
        <td class="tba"></td>
      </tr>
    </table>
  </div>

  <div class="uk-hidden" id="zone-tmpl">
    <table>
      <tr>
        <td class="zone"></td>
        <td>
          <button class="uk-button uk-button-default uk-margin-small-right zone-count" type="button"
            uk-toggle="target: #offcanvas-usage"></button>
          <table class="tbas uk-hidden"></table>
        </td>
      </tr>
    </table>
  </div>

  <div class="uk-hidden" id="cluster-tmpl">
    <div class="cluster">
      <div class="uk-card uk-card-body">
        <div class="uk-grid-match" uk-grid>
          <div class="uk-margin-small-left">
            <h3 class="uk-card-title"></h3>
          </div>
          <div class="">
            <button class="zone-total uk-button uk-button-default" type="button"
              uk-toggle="target: #offcanvas-usage">#</button>
          </div>
        </div>
        <div>

          <table class="uk-table uk-table-divider">
            <thead>
              <tr>
                <th>Location</th>
                <th># TBA's</th>
              </tr>
            </thead>
            <tbody>

            </tbody>
          </table>

        </div>
      </div>
    </div>
  </div>
`;


function update_tbas(e) {
  const $tba_table = document.querySelector("#tba-table")
  const $rows = e.parentNode.querySelectorAll(".tbas tr")
  
  const sort_zone_info = tr => {
    const sort_zone = tr.querySelector(".sort-zone").innerText
    const regex = /^([A-Z])\-([0-9]{1,2})\.([0-9])([A-Z])$/m
    const matches = sort_zone.match(regex)
    const [_, cluster, aisle, tier, container] = matches
    return { cluster, aisle, tier, container }
  }
  
  const by_sort_zone = (a, b) => {
    const sz_a = sort_zone_info(a)
    const sz_b = sort_zone_info(b)
    
    if (sz_a.cluster < sz_b.cluster) return -1
    if (sz_a.cluster > sz_b.cluster) return 1
    if (Number(sz_a.aisle) < Number(sz_b.aisle)) return -1
    if (Number(sz_a.aisle) > Number(sz_b.aisle)) return 1
    if (sz_a.container < sz_b.container) return -1
    if (sz_a.container > sz_b.container) return 1
    if (sz_a.tier < sz_b.tier) return -1
    if (sz_a.tier > sz_b.tier) return 1
    return 0;
  }
  
  const $sorted_rows = Array.from($rows).sort(by_sort_zone)
  
  $tba_table.innerHTML = ""

  for (const $row of $sorted_rows) {
      $tba_table.appendChild($row.cloneNode(true))
  }
}

function digest_dwelling(data) {
    let dwelling = {}

    for (const o of data) {
        const zone = o.sortZone
        const tba  = o.trackingId

        const matches = zone.match(/([A-Z])-([0-9]+)\.([0-9][A-Z])/i)
        if (matches == null) 
          continue

        const [_, cluster, aisle, location] = matches

        if (dwelling[cluster] === undefined)
            dwelling[cluster] = {}

        const gen_aisle_name = aisle => {
            const is_even = (aisle % 2 == 0)
            const buddy_aisle = is_even ? (aisle - 1) : (aisle + 1)
            return is_even ? `${buddy_aisle}/${aisle}` : `${aisle}/${buddy_aisle}`
        }

        const aisle_name = gen_aisle_name(Number(aisle))

        if (dwelling[cluster][aisle_name] === undefined)
            dwelling[cluster][aisle_name] = {}

        if (dwelling[cluster][aisle_name][zone] === undefined)
            dwelling[cluster][aisle_name][zone] = []

        dwelling[cluster][aisle_name][zone].push(tba)
    }

    return dwelling
}

function show_dwelling(data) {
  const dwelling = digest_dwelling(data)

  const clone_node = q => document.querySelector(q).cloneNode(true)
  const count_tbas = zones => {
      let tbas = 0
      for (const sort_zone in zones) {
          tbas += zones[sort_zone].length
      }
      return tbas
  }
  const $clusters = document.querySelector("#clusters")

  const sorted_clusters = Object.keys(dwelling).sort((a, b) => {
    if (a < b) return -1
    if (a > b) return 1
    return 0
  })

  for (const cluster of sorted_clusters) {
      let $clone = clone_node("#cluster-tmpl .cluster")

      $clone.querySelector(".uk-card-title").innerText = cluster

      const $zones = $clone.querySelector("table tbody")

      $clone.querySelector(".uk-button").addEventListener("click", event => {
          update_tbas($zones)
      })

      const sorted_zones = Object.keys(dwelling[cluster]).sort((a, b) => {
        const a_matches = a.split("/")
        const b_matches = b.split("/")

        const a_num = Number(a_matches[0])
        const b_num = Number(b_matches[0])

        if (a_num < b_num) return -1
        if (a_num > b_num) return 1
        return 0
      })

      for (const zone of sorted_zones) {
          const tbas = dwelling[cluster][zone]

          let $zclone = clone_node("#zone-tmpl tr")

          $zclone.querySelector(".zone").innerText = `${cluster}-${zone}`
          $zclone.querySelector(".zone-count").innerText = count_tbas(tbas)

          for (const sort_zone in tbas) {
              for (const tba of tbas[sort_zone]) {
                  const $tclone = clone_node("#tba-tmpl tr")
                  $tclone.querySelector(".sort-zone").innerText = `${sort_zone}`
                  $tclone.querySelector(".tba").innerText = tba
                  $zclone.querySelector(".uk-button").addEventListener("click", event => {
                      update_tbas($tclone.parentNode)
                  })

                  $zclone.querySelector(".tbas").appendChild($tclone)
              }
          }

          $zones.appendChild($zclone)

          let total = 0
          for (const t of $zones.querySelectorAll(".uk-button")) {
            total += Number(t.innerText)
          }
          $clone.querySelector(".zone-total").innerText = total
      }


      $clusters.appendChild($clone)
  }
}


const remove_resources = () => {
  const resources = document.querySelectorAll('script,style,link[rel="stylesheet"]')
  resources.forEach(element => element.remove())
}



function loadStyle(href){
  // avoid duplicates
  for(var i = 0; i < document.styleSheets.length; i++){
      if(document.styleSheets[i].href == href){
          return;
      }
  }
  var head  = document.getElementsByTagName('head')[0];
  var link  = document.createElement('link');
  link.rel  = 'stylesheet';
  link.type = 'text/css';
  link.href = href;
  head.appendChild(link);
}

function loadJS(url, callback){
  var scriptTag = document.createElement('script');
  scriptTag.src = url;
  scriptTag.onload = callback;
  scriptTag.onreadystatechange = callback;
  document.body.appendChild(scriptTag);
};

const urlParams = new URLSearchParams(window.location.search);

const cycle = urlParams.get("cycle");
const station = urlParams.get("station");
const dwell_start = urlParams.get("start");
const dwell_end = "1300";

if (station == undefined) return true; 

remove_resources()
document.body.innerHTML = html;

document.title = "Robert Wins - Dwelling!";

loadStyle("https://cdnjs.cloudflare.com/ajax/libs/uikit/3.10.1/css/uikit.min.css");
loadJS("https://cdnjs.cloudflare.com/ajax/libs/uikit/3.10.1/js/uikit.min.js", () => {});

document.querySelector("#dwell-time-start").value = dwell_start;
document.querySelector("#FRM_STATION").value = station;
document.querySelector("#FRM_CYCLE").value = cycle;


const response = await fetch("https://logistics.amazon.com/station/proxyapigateway/data", {
  headers: { "Content-Type": "application/json" },
  body: "{\"resourcePath\":\"/os/getDrillDownData\",\"httpMethod\":\"post\",\"processName\":\"oculus\",\"requestBody\":{\"nodeId\":\"" + station + "\",\"packageStatusMap\":{\"Inducted\":[],\"Stow Problem Solve\":[]},\"filters\":[{\"__type\":\"TermFilter:http://internal.amazon.com/coral/com.amazon.oculusservice.model.filter/\",\"filterMap\":{\"DWELL_TIME\":[\"" + dwell_start + "_MINUTES\",\"" + dwell_end + "_MINUTES\"],\"CYCLE\":[\"" + cycle + "\"],\"SHIPMENT_TYPE\":[\"Delivery\"]}},{\"__type\":\"RangeFilter:http://internal.amazon.com/coral/com.amazon.oculusservice.model.filter/\",\"filterMap\":{}}]}}",
  method: "POST"
})

const data = await response.json()

document.querySelector("#print-btn").onclick = () => {
  
  const table = document.querySelector("#tba-table");
  const winHtml = `<!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin:0; padding:0; font-family:"consolas"; font-size:14px; line-height:14px; }
          table { border-style:collapse; }
          td { padding:.2em; }
        </style>
      </head>
      <body><table>${table.innerHTML}</table>
      <script> window.print() </script>
      </body>
    </html>
  `;

  const winUrl = URL.createObjectURL(
    new Blob([winHtml], { type: "text/html" })
  );

  const win = window.open(
    winUrl,
    "Robert Wins - Dwelling!",
    "width=800,height=400,screenX=200,screenY=200"
  );

}
  
show_dwelling(data.packageResultList);

})();