import ShoppingList from "@/components/ShoppingList";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-4 px-2 sm:py-6 sm:px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Shopping List</h1>
          <p className="text-sm sm:text-base text-gray-600">Keep track of your shopping items</p>
        </div>
        
        <div className="flex justify-center">
          <ShoppingList />
        </div>
        
        <div className="mt-4 sm:mt-6">
        </div>
      </div>
    </div>
  );
};

export default Index;