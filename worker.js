// worker.js

CLOSURE_BASE_PATH = "closure-library/closure/goog/";


importScripts("closure-library/closure/goog/bootstrap/webworkers.js","closure-library/closure/goog/base.js");
importScripts("hello.js");

class PriceDepth {
  constructor(price) {
    this.price = price;
    this.list = [];
    this.timeComp = (a,b)=>a.time-b.time;
  }

  push(time, depth) {
    let o = new Object();
    o.time = time;
    o.depth = depth;
    this.list.push(o);
  }

  getDepthIndex(time) {
    let o = new Object();
    o.time = time;
    let idx = goog.array.binarySearch(this.list,o,this.timeComp);
    if (idx < 0) {
      idx = -idx - 1;
      if (idx == 0) {
        return -1;
      }
    }
    return idx-1;
  }
}

class Dom {

  constructor() {
    this.dom =[];
    this.lastDepth = new Map();
    this.priceComp = (a,b)=>a.price-b.price;
  }

  // NOTE OPTIMIZE if resulting updated entry is zero -> remove entry !!
  add(time, price, depth) {
    let roundedPrice = price | 0;
    let pd = new PriceDepth(roundedPrice);
    const idx = goog.array.binarySearch(this.dom, pd, this.priceComp);
    if (idx < 0) {
      goog.array.binaryInsert(this.dom, pd, this.priceComp);
      pd.push(time, depth);
    }
    else {
      const previousDepth = this.lastDepth[price];
      const adjust = previousDepth ? depth - this.lastDepth[price] : depth;
      if (adjust != 0) {
        pd = this.dom[idx];
        const last = pd.list[pd.list.length - 1];
        if (last.time == time) {
          last.depth = last.depth + adjust;
        }
        else {
          pd.push(time, last.depth + adjust);
        }
      }
    }
    this.lastDepth[price] = depth;

  }


  samplePriceRow(from, to, timeStep, pd, width, row, buffer) {
    //timeStep = 1000; // 1 second fixed
    let endcol = (row+1) * width * 3;
    let startOfLine = row * width * 3;
    let t = to;
    let idx = pd.getDepthIndex(to);
    while (idx >= 0 && /*t>=from &&*/ endcol>startOfLine) { // end condition on t??
      let t0 = pd.list[idx].time;
      let startcol = Math.max(endcol - 3 * Math.ceil((t - t0) / timeStep), startOfLine);
      if (startcol >= startOfLine) {
        buffer.fill(Math.min(pd.list[idx].depth , 255), startcol, endcol);
      }
      endcol = startcol;
      t = t0;
      idx = idx - 1;
    }
  }

  sample(fromPrice, toPrice, priceStep, from, to, timeStep, height, width) {
    result = new Uint8Array(3 * ((to-from)/timeStep) * ((toPrice-fromPrice)/priceStep));

    let price = fromPrice;
    let row = 0;
    let pd = new PriceDepth(fromPrice);
    let idx = goog.array.binarySearch(this.dom, pd, this.priceComp);
    while (row<height && -idx+1<this.dom.length) {
      if (idx < 0) {
        idx = -idx + 1;
      }
      pd = this.dom[idx];
      p = pd.price;
      row = (p - fromPrice) / priceStep | 0;
      idx = pd.getDepthIndex(fromTime);
      let t = fromTime
      let t1 = null;
      let ob = null;
      if (idx < pd.list.length-1) {
        t1 = pd.list[idx+1].time;
      }
      if (idx >=0) {
        ob = pd.list[idx];
      }
      let offset = row*width;
      for (i=0; i<width; i++) {
        if (idx >= 0) {
          result[offset + i] = result[offset + i] + ob.depth; // should be scaled depth
        }
        t = t+timeStep;
        if (t1 && t>=t1) {
          idx = idx+1;
          ob = pd.list[idx];
        }
      }

      row = row + 1;
    }
  }
}

function buildBitmap(sharedArray, width, height, range, price, timestep)
{
  const pstep = range/height;
  let p = 3500;
  let t = new Date().getTime();
  for (let i = 0; i < height; i++) {
    let idx = goog.array.binarySearch(dd.dom, new PriceDepth(p), (a,b)=>a.price-b.price);
    if (idx >= 0) {
      pd = dd.dom[idx];
      if (!pd) {
        console.log("pd is null");
      }
      dd.samplePriceRow(t - 60000, t, timestep, pd, width, i, sharedArray);
    }
    p = p + 1;
  }
  /*console.log(new Date().getTime());
  for (i = 3000; i < 4500; i++) {
    pd = new PriceDepth(i);
    dd.samplePriceRow(t - 2500, t, 25, pd, 2500, 0, new Uint8Array(3 * 2500 * 100));
  }*/
  console.log(new Date().getTime());

  //postMessage("zoomed");
}

let dd = new Dom();

function processDepthUpdate(data) {
  if (data.e) {
    data.b.forEach((x,idx) =>  {
      dd.add(data.E, parseFloat(x[0]), parseFloat(x[1]));
    });
    data.a.forEach((x,idx) =>  {
      dd.add(data.E, parseFloat(x[0]), parseFloat(x[1]));
    });
  }
  //dd.add(depth.)
}



self.addEventListener('message', (event) => {
  console.log("WORKER called");
  const sharedArray = new Uint8Array(event.data.sab);

  if (event.data.func=="XXXslice") {
    sharedArray.fill(128,0,sharedArray.length);
  }
  else {
    buildBitmap(sharedArray, event.data.w, event.data.h, event.data.range, event.data.price, event.data.pixeltime);
  }

  postMessage({"func": event.data.func});


}, false);

var websock = new WebSocket("wss://stream.binance.com:9443/ws/ethusdt");
websock.onmessage = function(event) {
  //console.log(event.data);
  let data = JSON.parse(event.data);
  if (data.e == "depthUpdate") {
    processDepthUpdate(data);
  }
  else if (data.e == "aggTrade") {
    processAggTrade(data);
  }
  };

websock.onopen = function(event) {
  websock.send('{"method": "SUBSCRIBE","params":["ethusdt@depth"],"id": 1}');
  websock.send('{"method": "SUBSCRIBE","params":["ethusdt@aggTrade"],"id": 1}');
}
