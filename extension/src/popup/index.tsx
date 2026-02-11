import "~styles/globals.css"

function Popup() {
  return (
    <div className="w-[380px] h-[500px] flex flex-col items-center justify-center bg-white">
      <h1 className="text-3xl font-bold text-gitty-600">Gitty</h1>
      <p className="mt-2 text-sm text-gray-500">Gamify your git commits</p>
    </div>
  )
}

export default Popup
