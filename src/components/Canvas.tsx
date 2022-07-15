import { useRef, useEffect, useState } from 'react'

/**
 * Wrapper class for strokes
 */
class Stroke {
  private static masterId: number = 0
  public path: number[]                           // TODO: Private after qcurve fixed
  private startX: number|undefined
  private startY: number|undefined
  private id: number

  public constructor(path: number[]=[]) {
    this.path = path
    this.id = Stroke.masterId++

    if (path.length !== 0) {
      this.setStart(path[0], path[1])
    }
  }

  public addToPath(offsetX: number, offsetY: number) {
    if (this.path.length === 0) {
      this.setStart(offsetX, offsetY)
    }

    this.path.push(offsetX, offsetY)
  }

  public smoothPath() {
    for (let i = 2; i < this.getLength(); i++) {
      var {x, y} = Stroke.bezier(this.path[i*2-4], this.path[i*2-3], this.path[i*2-2], this.path[i*2-1], this.path[i*2], this.path[i*2+1])
      this.path[i*2-2] = x
      this.path[i*2-1] = y
    }
  }

  // custom iterator, returns a tuple [x, y] on each iteration
  public [Symbol.iterator]() {
    let index = 0
    return {
      next: () => {
        let result: {value: [number, number], done: boolean}

        if (index < this.getLength()) {
          result = {value: this.getPathVertex(index), done: false}
          index++
        }
        else {
          result = {value: undefined, done: true}
        }

        return result 
      }
    }
  }

  public isEmpty() {
    return this.path.length === 0
  }

  public getPathVertex(index: number): [number, number] {
    return [this.path[index * 2], this.path[index * 2 + 1]]
  }

  public getPath() {
    return this.path
  }

  public getID() {
    return this.id
  }

  public getLength() {
    return this.path.length / 2
  }

  public getStartX() {
    return this.startX
  }

  public getStartY() {
    return this.startY
  }

  private setStart(startX: number, startY: number) {
    this.startX = startX
    this.startY = startY
  }

  // takes in 3 points, calculates the quadratic bezier curve and return the middle of the curve
  // aka smoothes out the middle point
  private static bezier = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
    return {x : .5 ** 2 * x0 + 2 * .5 ** 2 * x1 + .5**2 * x2, y : .5 ** 2 * y0 + 2 * .5 ** 2 * y1 + .5 **2 * y2}
  }
}

/**
 * Divides up the canvas into sections containing strokes to optimize the erasing process
 */
class Tile {
  private static size = 2000 // size of each tile
  private startX: number // top left (smaller)
  private startY: number
  private endX: number // bottom right (bigger)
  private endY: number
  private strokes: Stroke[]
  private strokeIDs: number[]
  private neighboringTiles: Tile[]

  public constructor(x: number, y: number) { 
    this.startX = x
    this.startY = y
    this.endX = x + Tile.size
    this.endY = y + Tile.size

    this.strokes = []
    this.strokeIDs = []
  }

  public addStroke(stroke: Stroke) {
    this.strokes.push(stroke)
    this.strokeIDs.push(stroke.getID())
  }

  public removeStroke(strokeID: number) {
    if (!this.strokeIDs.includes(strokeID)) return
    this.strokes = this.strokes.filter((s) => s.getID() !== strokeID)
    this.strokeIDs = this.strokeIDs.filter((s) => s !== strokeID)
  }

  public isEmpty() {
    return this.strokeIDs.length === 0
  }

  public numElements() {
    return this.strokes.length
  }

  public getStrokes() {
    return this.strokes
  }

  public getStroke(index: number) {
    return this.strokes[index]
  }
  
  public enclosesVertex(x: number, y: number) {
    return x - this.startX >= 0 && this.endX - x > 0 && y - this.startY >= 0 && this.endY - y > 0
  }
}

/**
 * Canvas component covering the entire window
 */
const Canvas = (props: {}) => { 
    /************************
            Variables
    ************************/
    // references to canvas and context, used for drawing
    const canvasRef = useRef(null)
    const contextRef = useRef(null)

    // states
    let isDrawing = false
    let isErasing = false
    let currStroke = new Stroke()

    let onScreenTiles: Tile[] = []


    /************************
          Mouse Events
    ************************/
    // will direct to different functions depending on button pressed
    const pointerDown = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
      if (nativeEvent.button === 0) startDraw(nativeEvent)
      else if (nativeEvent.button === 2) startErase(nativeEvent)
    }
    const pointerUp = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
      if (nativeEvent.button === 0 || nativeEvent.button === -1) endDraw()
      if (nativeEvent.button === 2 || nativeEvent.button === -1) endErase()
    }
    const pointerMove = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
      draw(nativeEvent)
      erase(nativeEvent)
    }


    /************************
            Draw
    ************************/
    const strokeWidth = 2

    // when LMB is pressed, begins a new path and move it to the mouse's position
    const startDraw = (pointerEvent: PointerEvent) => {
      isDrawing = true
      const {offsetX, offsetY} = pointerEvent
      contextRef.current.beginPath()
      contextRef.current.moveTo(offsetX, offsetY)
      contextRef.current.arc(offsetX, offsetY, strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
      contextRef.current.stroke() // actually draws it
      currStroke.addToPath(offsetX, offsetY) // adds x, y to currStroke
      // console.log(currStroke)
    }
    // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
    const draw = (pointerEvent: PointerEvent) => {
      if (!isDrawing) return
      const {offsetX, offsetY} = pointerEvent // gets current mouse position
      currStroke.addToPath(offsetX, offsetY) // adds x, y to currStroke

      // draws the line
      contextRef.current.lineTo(offsetX, offsetY)
      contextRef.current.stroke()
    }
    // when LMB is lifted, will close current path and add the stroke to strokes and clear currStroke
    const endDraw = () => {
      isDrawing = false
      if (currStroke.isEmpty()) return
      currStroke.smoothPath()
      onScreenTiles[0].addStroke(currStroke) // NEED TO CHANGE LATER
      currStroke = new Stroke()
      // console.log("mouse lifted \n", currStroke)
    }

    // (re)draws all strokes by only drawing the difference
    // type: either 'draw' or 'erase'
    const redraw = (strokes: Stroke[], type='erase') => {
      if (strokes === undefined || strokes.length === 0) { // if no strokes then clear screen
        contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        return 
      }
      // sets to either only draw in the difference or remove the difference
      // if (type === 'draw') contextRef.current.globalCompositeOperation = 'source-out'
      // else if (type === 'erase') contextRef.current.globalCompositeOperation = 'destination-in'
      contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

      // adds a stroke to be redrawn
      const addStroke = (stroke: Stroke) => {
        contextRef.current.moveTo(stroke.getStartX(), stroke.getStartY())
        contextRef.current.arc(stroke.getStartX(), stroke.getStartY(), strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
        for (let i = 1; i < stroke.getLength()/2; i++) {
          contextRef.current.quadraticCurveTo(stroke.path[i*4], stroke.path[i*4+1], stroke.path[i*4+2], stroke.path[i*4+3])         // TODO: Use vertex getter
          // contextRef.current.lineTo(stroke.path[i*2], stroke.path[i*2+1])
        }
      }

      // adds all strokes to be redrawn and then draws all at once
      contextRef.current.beginPath()
      strokes.forEach(addStroke)
      contextRef.current.stroke()
      contextRef.current.globalCompositeOperation = 'source-over'
    }


    /************************
            Erase
    ************************/
    // keeps track of the last mouse position
    let lastX = 0, lastY = 0

    const startErase = (pointerEvent: PointerEvent) => {
      isErasing = true
      erase(pointerEvent)
    }
    // loops through all arrays in strokes and remove any stroke close to the mouse
    // when mouse is moving and RMB is pressed
    const erase = (pointerEvent: PointerEvent) => {
      if (!isErasing) return
      const {offsetX, offsetY} = pointerEvent // gets current mouse position
      if (withinSquare(offsetX, offsetY, lastX, lastY, 5)) return // if mouse didn't move much then we won't recheck
      const currentTile = getTile(onScreenTiles, offsetX, offsetY)
      if (currentTile.isEmpty()) return

      lastX = offsetX
      lastY = offsetY
      const allStrokes = [...currentTile.getStrokes()] // makes a copy of strokes to manipulate
      const size = 5 // the "radius" to erase

      loop1:
      for (let i = currentTile.numElements() - 1; i >= 0; i--) { // loops through each stroke in strokes
        for (const coord of (currentTile.getStrokes())[i]) {
          if (withinSquare(offsetX, offsetY, coord[0], coord[1], size)) {
            allStrokes.splice(i, 1) // if a stroke is within size, remove it from allStrokes      TODO: REDO THIS
            // redraws all strokes left in allStrokes
            redraw(allStrokes, 'erase')
            currentTile.removeStroke((currentTile.getStrokes())[i].getID())
            break loop1 // only erases 1 stroke
          }
        }
      }
    }
    const endErase = () => {
      isErasing = false
    }
  

    /************************
          useEffect
    ************************/
    // initializes canvas
    useEffect(() => {
      const canvas = canvasRef.current
      // makes the canvas "high resolution", apparantly we need to do this
      const dpr = window.devicePixelRatio * 2
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`

      // gets context which is what we use to draw and sets a few properties
      const context = canvas.getContext('2d')
      context.scale(dpr,dpr)
      context.lineCap = 'round' // how the end of each line look
      context.strokeStyle = 'black' // sets the color of the stroke
      context.lineWidth = strokeWidth
      context.lineJoin = 'round' // how lines are joined
      contextRef.current = context

      // initialize Tiles
      onScreenTiles.push(new Tile(0, 0))
    }, [])


    /************************
        Helper Functions
    ************************/
   // returns the tile the pointer is currently in, returns null if pointer not in any tile
   const getTile = (tiles: Tile[], x: number, y: number) => {
    for (const tile of tiles) {
      if (tile.enclosesVertex(x, y))
        return tile
    }
    return null
   }
    // returns if 2 coords are within a 'length' of each other
    const withinSquare = (x1: number, y1: number, x2: number, y2: number, length: number) => {
      return Math.abs(x1-x2) <= length && Math.abs(y1-y2) <= length
    }

  
  return (
      <canvas 
        onPointerDown={pointerDown} 
        onPointerUp={pointerUp} 
        onPointerMove={pointerMove}
        onPointerLeave={pointerUp}
        onContextMenu={(e) => e.preventDefault()}
        
        ref={canvasRef} 
      />
  )
}

export default Canvas
