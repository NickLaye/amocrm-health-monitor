import React from 'react';
import './TabsNav.css';

const TabsNav = ({ activeTab, onTabChange, tabs }) => {
  return (
    <div className="tabs-nav">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.icon && <span className="tab-icon">{tab.icon}</span>}
          {tab.label}
        </button>
      ))}
    </div>
  );
};

export default TabsNav;

