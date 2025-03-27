
interface CardProps {
  suit: '♠' | '♣' | '♥' | '♦';
  value: string;
  hidden?: boolean;
}

const Card = ({ suit, value, hidden = false }: CardProps) => {
  const isRed = suit === '♥' || suit === '♦';
  
  if (hidden) {
    return <div className="card">🂠</div>;
  }

  return (
    <div className={`card ${isRed ? 'red' : 'black'}`}>
      {value}{suit}
    </div>
  );
};

export default Card; 