import { useLayoutEffect, useState } from "react";
import "./index.css";
import rough from "roughjs/bundled/rough.esm";

const generator = rough.generator();

const createElementRough = (x1, y1, x2, y2, elementType) => {
  let roughElement; // Use let to define roughElement outside conditionals
  if (elementType === 'line') {
    roughElement = generator.line(x1, y1, x2, y2);
  } else if (elementType === 'rectangle') {
    roughElement = generator.rectangle(x1, y1, x2 - x1, y2 - y1);
  }

  return { x1, y1, x2, y2, roughElement };
};

function App() {
  const [elements, setElements] = useState([]);
  const [drawing, setDrawing] = useState(false);
  const [elementType, setElementType] = useState('line');

  useLayoutEffect(() => {
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);

    const roughCanvas = rough.canvas(canvas);
    elements.forEach(({ roughElement }) => roughCanvas.draw(roughElement));  // roughElement is now defined properly
  }, [elements]);

  const handleMouseDown = (e) => {
    setDrawing(true);
    const { clientX, clientY } = e;
    const element = createElementRough(clientX, clientY, clientX, clientY, elementType);
    setElements((prevState) => [...prevState, element]);
  };

  const handleMouseMove = (e) => {
    if (!drawing) return;
    const { clientX, clientY } = e;
    const index = elements.length - 1;
    const { x1, y1 } = elements[index];
    const updatedElement = createElementRough(x1, y1, clientX, clientY, elementType);

    const elementCopy = [...elements];
    elementCopy[index] = updatedElement;
    setElements(elementCopy);
  };

  const handleMouseUp = () => setDrawing(false);

  return (
    <div>
      <div className="fixed">
        <input
          type="radio"
          id="line"
          checked={elementType === "line"}
          onChange={() => setElementType("line")}
        />
        <label htmlFor="line">Line</label>
        <input
          type="radio"
          id="rectangle"
          checked={elementType === "rectangle"}
          onChange={() => setElementType("rectangle")}
        />
        <label htmlFor="rectangle">Rectangle</label>
      </div>

      <canvas
        id="canvas"
        className="bg-slate-500"
        width={window.innerWidth}
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      ></canvas>
    </div>
  );
}

export default App;
